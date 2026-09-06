import { getSession } from "@/lib/session-server";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { ComplaintsClient } from "./complaints-client";

export const dynamic = "force-dynamic";

export default async function PengaduanPage() {
  const session = (await getSession())!;
  const allowed = await withAuth(session, (q) => hasPermission(session, q, "complaint.read"));
  if (!allowed) redirect("/403");
  return <ComplaintsClient />;
}
