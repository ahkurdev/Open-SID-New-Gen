import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const chatSchema = z.object({
  question: z.string().min(3).max(500),
});

// AI Village Copilot - rule-based, permission-scoped, NO hallucination.
// ponytail: rule-based intent matching (bukan LLM). Ganti ke LLM + function
// calling saat OPENAI_API_KEY tersedia; guardrail permission & audit tetap.
const INTENTS: {
  keywords: string[];
  permission: string;
  scope: string;
  run: (vid: string) => Promise<{ rows: unknown[] }>;
  format: (rows: Record<string, unknown>[]) => string;
}[] = [
  {
    keywords: ["pengaduan", "complaint"],
    permission: "complaint.read",
    scope: "complaints (status belum selesai)",
    run: (vid) => withAuth({ villageId: vid } as never, (db) => db.query(
      `SELECT category, COUNT(*)::int AS total FROM complaints
       WHERE village_id = $1 AND status NOT IN ('resolved','closed','rejected')
       GROUP BY category ORDER BY total DESC`, [vid])),
    format: (rows) => rows.length === 0
      ? "Tidak ada pengaduan aktif. Semua sudah selesai."
      : "Pengaduan belum selesai per kategori:\n" + rows.map((r) => `- ${r.category}: ${r.total}`).join("\n"),
  },
  {
    keywords: ["surat", "letter"],
    permission: "letter.read",
    scope: "letters (status pengajuan)",
    run: (vid) => withAuth({ villageId: vid } as never, (db) => db.query(
      `SELECT status, COUNT(*)::int AS total FROM letters
       WHERE village_id = $1 GROUP BY status ORDER BY total DESC`, [vid])),
    format: (rows) => rows.length === 0
      ? "Belum ada data surat."
      : "Surat per status:\n" + rows.map((r) => `- ${r.status}: ${r.total}`).join("\n"),
  },
  {
    keywords: ["penduduk", "warga", "jumlah"],
    permission: "resident.read",
    scope: "residents (agregat, tanpa data pribadi)",
    run: (vid) => withAuth({ villageId: vid } as never, (db) => db.query(
      `SELECT gender, COUNT(*)::int AS total FROM residents
       WHERE village_id = $1 AND deleted_at IS NULL GROUP BY gender`, [vid])),
    format: (rows) => rows.length === 0
      ? "Belum ada data penduduk."
      : "Jumlah penduduk aktif:\n" + rows.map((r) => `- ${r.gender}: ${r.total}`).join("\n"),
  },
  {
    keywords: ["bantuan", "aid"],
    permission: "aid.read",
    scope: "aid_recipients (agregat status)",
    run: (vid) => withAuth({ villageId: vid } as never, (db) => db.query(
      `SELECT status, COUNT(*)::int AS total FROM aid_recipients
       WHERE village_id = $1 GROUP BY status ORDER BY total DESC`, [vid])),
    format: (rows) => rows.length === 0
      ? "Belum ada data bantuan."
      : "Penerima bantuan per status:\n" + rows.map((r) => `- ${r.status}: ${r.total}`).join("\n"),
  },
  {
    keywords: ["aset", "asset"],
    permission: "asset.read",
    scope: "assets (agregat kondisi)",
    run: (vid) => withAuth({ villageId: vid } as never, (db) => db.query(
      `SELECT condition, COUNT(*)::int AS total FROM assets
       WHERE village_id = $1 AND status != 'dihapus' GROUP BY condition`, [vid])),
    format: (rows) => rows.length === 0
      ? "Belum ada data aset."
      : "Aset per kondisi:\n" + rows.map((r) => `- ${r.condition}: ${r.total}`).join("\n"),
  },
];

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);
    if (!ctx.villageId) return fail("Tidak terhubung ke desa", 400);

    const body = await req.json().catch(() => null);
    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) return fail("Pertanyaan tidak valid", 422);
    const q = parsed.data.question.toLowerCase();

    const result = await withAuth(ctx, async (db) => {
      // cari intent yang cocok DAN yang permissionnya dimiliki user
      const matched: string[] = [];
      let answer: string | null = null;
      const scopesUsed: string[] = [];

      for (const intent of INTENTS) {
        if (!intent.keywords.some((k) => q.includes(k))) continue;
        matched.push(intent.scope);
        const allowed = await hasPermission(ctx, db, intent.permission);
        if (!allowed) continue; // tidak punya permission: skip, bukan error
        const res = await intent.run(ctx.villageId as string);
        answer = intent.format(res.rows as Record<string, unknown>[]);
        scopesUsed.push(intent.scope);
        break;
      }

      const finalAnswer = answer ??
        (matched.length > 0
          ? "Saya menemukan pertanyaan tentang data tersebut, tetapi Anda tidak memiliki izin untuk melihatnya."
          : "Saya hanya bisa menjawab pertanyaan tentang data desa: pengaduan, surat, jumlah penduduk, bantuan, dan aset. Data tidak tersedia untuk pertanyaan ini.");

      await db.query(
        `INSERT INTO ai_chat_log (village_id, user_id, question, answer, data_scope)
         VALUES ($1,$2,$3,$4,$5)`,
        [ctx.villageId, ctx.userId, parsed.data.question, finalAnswer, JSON.stringify(scopesUsed)]
      );
      await writeAudit(ctx, req, db, { action: "ai_copilot.ask", entityType: "ai_chat", entityId: null, newValues: { scopes: scopesUsed } });

      return {
        answer: finalAnswer,
        scopes: scopesUsed,
        disclaimer: "Jawaban dihasilkan dari data aktual database sesuai izin Anda. AI tidak mengarang angka dan tidak membuat keputusan.",
      };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
