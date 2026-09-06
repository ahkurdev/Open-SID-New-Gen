import { getSession } from "@/lib/session-server";
import { withAuth } from "@/lib/db";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/data-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const data = await withAuth(session, async (q) => {
    const roles = await q.query(
      `SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
      [session.userId]
    );
    return { roles: roles.rows as { name: string }[] };
  });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <PageHeader
        title="Akun Belum Terhubung Desa"
        description="Akun Anda belum terhubung ke data desa mana pun. Hubungi admin platform untuk penugasan desa."
      />
      <Card>
        <CardHeader><CardTitle>Detail Akun</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>{session.name}</strong> ({session.email})</p>
          <div className="flex gap-1">
            {data.roles.map((r) => <Badge key={r.name} variant="muted">{r.name}</Badge>)}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
