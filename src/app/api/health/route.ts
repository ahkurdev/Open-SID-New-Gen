import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await pool.query("SELECT 1 AS ok");
    return NextResponse.json({
      ok: true,
      service: "village-os",
      db: r.rows[0].ok === 1 ? "up" : "unknown",
      time: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[health]", e);
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
