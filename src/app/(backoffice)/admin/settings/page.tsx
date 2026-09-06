import { PageHeader } from "@/components/ui/data-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSession } from "@/lib/session-server";
import { withAuth } from "@/lib/db";
import { getPermissions } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = (await getSession())!;
  const permissions = await withAuth(session, (q) => getPermissions(session, q));

  return (
    <div>
      <PageHeader title="Pengaturan" description="Preferensi aplikasi dan informasi sistem" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Tampilan</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>Gunakan tombol matahari/bulan di navbar untuk beralih mode terang/gelap. Preferensi tersimpan di perangkat ini.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Permission Anda</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {permissions.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada permission khusus.</p>}
              {permissions.map((p) => <Badge key={p} variant="muted">{p}</Badge>)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
