import { getSession } from "@/lib/session-server";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { AssetsClient } from "./assets-client";

export const dynamic = "force-dynamic";

export default async function AsetPage() {
  const session = (await getSession())!;
  const allowed = await withAuth(session, (q) => hasPermission(session, q, "asset.manage"));
  if (!allowed) redirect("/403");
  return <AssetsClient />;
}
