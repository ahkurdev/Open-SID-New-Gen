import { redirect } from "next/navigation";
import { getSession } from "@/lib/session-server";
import { withAuth } from "@/lib/db";
import { getPermissions } from "@/lib/rbac";
import { AppShell } from "./app-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.villageId) redirect("/onboarding");

  const { permissions, villageName, unread } = await withAuth(session, async (q) => {
    const perms = await getPermissions(session, q);
    const v = await q.query("SELECT name FROM villages WHERE id = $1", [session.villageId]);
    const n = await q.query(
      "SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND read_at IS NULL",
      [session.userId]
    );
    return {
      permissions: perms,
      villageName: v.rows[0]?.name ?? "Desa",
      unread: n.rows[0]?.c ?? 0,
    };
  });

  return (
    <AppShell
      userName={session.name}
      userEmail={session.email}
      villageName={villageName}
      permissions={permissions}
      unreadCount={unread}
    >
      {children}
    </AppShell>
  );
}
