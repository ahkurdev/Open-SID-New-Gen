import { withAuth } from "@/lib/db";
import { getSession } from "@/lib/session-server";
import { PageHeader } from "@/components/ui/data-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/input";
import { SessionsClient } from "./sessions-client";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = (await getSession())!;
  const data = await withAuth(session, async (q) => {
    const u = await q.query(
      `SELECT u.email, u.name, u.phone, u.email_verified_at, u.last_login_at, v.name AS village_name
       FROM users u LEFT JOIN villages v ON v.id = u.village_id WHERE u.id = $1`,
      [session.userId]
    );
    const roles = await q.query(
      `SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
      [session.userId]
    );
    return { user: u.rows[0], roles: roles.rows as { name: string }[] };
  });

  return (
    <div>
      <PageHeader title="Profil Saya" description="Informasi akun, verifikasi, dan sesi aktif" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Informasi Akun</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><Label>Nama</Label><p>{data.user.name}</p></div>
            <div>
              <Label>Email</Label>
              <p className="flex items-center gap-2">
                {data.user.email}
                {data.user.email_verified_at
                  ? <Badge variant="success">terverifikasi</Badge>
                  : <Badge variant="warning">belum verifikasi</Badge>}
              </p>
            </div>
            <div><Label>Desa</Label><p>{data.user.village_name ?? "-"}</p></div>
            <div>
              <Label>Role</Label>
              <div className="flex flex-wrap gap-1">
                {data.roles.map((r) => <Badge key={r.name}>{r.name}</Badge>)}
              </div>
            </div>
            <div><Label>Login terakhir</Label><p>{data.user.last_login_at ? new Date(data.user.last_login_at).toLocaleString("id-ID") : "-"}</p></div>
          </CardContent>
        </Card>

        <SessionsClient />
      </div>
    </div>
  );
}
