import { getSession } from "@/lib/session-server";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { AidClient } from "./aid-client";

export const dynamic = "force-dynamic";

export default async function BantuanPage() {
  const session = (await getSession())!;
  const allowed = await withAuth(session, (q) => hasPermission(session, q, "aid.read"));
  if (!allowed) redirect("/403");
  return <AidClient />;
}
