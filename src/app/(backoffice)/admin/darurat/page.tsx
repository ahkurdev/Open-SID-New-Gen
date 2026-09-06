import { getSession } from "@/lib/session-server";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { EmergencyClient } from "./emergency-client";

export const dynamic = "force-dynamic";

export default async function DaruratPage() {
  const session = (await getSession())!;
  const allowed = await withAuth(session, (q) => hasPermission(session, q, "safety.read"));
  if (!allowed) redirect("/403");
  return <EmergencyClient />;
}
