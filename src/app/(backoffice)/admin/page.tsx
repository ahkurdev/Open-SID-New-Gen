import { withAuth } from "@/lib/db";
import { getSession } from "@/lib/session-server";
import { PageHeader, StatCard } from "@/components/ui/data-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Users, Activity } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = (await getSession())!;
  const stats = await withAuth(session, async (q) => {
    const [users, notifications] = await Promise.all([
      q.query("SELECT COUNT(*)::int AS c FROM users WHERE deleted_at IS NULL"),
      q.query(
        `SELECT id, title, body, created_at, read_at FROM notifications
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [session.userId]
      ),
    ]);
    return { users: users.rows[0].c, notifications: notifications.rows };
  });

  return (
    <div>
      <PageHeader
        title={`Selamat datang, ${session.name}`}
        description="Ringkasan aktivitas desa. Modul lanjutan menyusul di fase berikutnya."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pengguna Sistem" value={stats.users} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Penduduk" value="-" hint="Fase 4" />
        <StatCard label="Surat Bulan Ini" value="-" hint="Fase 6" />
        <StatCard label="Pengaduan Aktif" value="-" hint="Fase 9" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Notifikasi Terbaru</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.notifications.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="Belum ada notifikasi"
                description="Notifikasi approval, pengaduan, dan agenda akan muncul di sini."
              />
            ) : (
              <ul className="space-y-3">
                {stats.notifications.map((n) => (
                  <li key={n.id} className="border-b pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Roadmap Modul</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {[
                ["Penduduk & Keluarga", "/admin/penduduk", "Fase 4"],
                ["Surat & Workflow", "/admin/surat", "Fase 6"],
                ["Pengaduan", "/admin/pengaduan", "Fase 9"],
                ["Keuangan", "/admin/keuangan", "Fase 13"],
                ["GIS & Digital Twin", "/admin/gis", "Fase 17"],
                ["Smart Village / IoT", "/admin/iot", "Fase IoT"],
              ].map(([label, href, phase]) => (
                <li key={href} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <Link href={href} className="hover:text-primary">{label}</Link>
                  <span className="text-xs text-muted-foreground">{phase}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
