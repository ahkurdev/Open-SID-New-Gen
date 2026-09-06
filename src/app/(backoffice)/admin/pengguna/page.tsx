import { getSession } from "@/lib/session-server";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function PenggunaPage() {
  const session = (await getSession())!;
  const allowed = await withAuth(session, (q) => hasPermission(session, q, "user.manage"));
  if (!allowed) redirect("/403");
  return <UsersClient />;
}
