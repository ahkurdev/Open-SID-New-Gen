import { getSession } from "@/lib/session-server";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { CommunityClient } from "./community-client";

export const dynamic = "force-dynamic";

export default async function KomunitasPage() {
  const session = (await getSession())!;
  const allowed = await withAuth(session, (q) => hasPermission(session, q, "community.read"));
  if (!allowed) redirect("/403");
  return <CommunityClient />;
}
