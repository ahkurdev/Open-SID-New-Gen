import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session-server";
import { QueueClient } from "./queue-client";

export const dynamic = "force-dynamic";

export default async function AntreanPage() {
  const session = (await getSession())!;
  const allowed = await withAuth(session, (q) => hasPermission(session, q, "letter.process"));
  if (!allowed) redirect("/403");
  return <QueueClient />;
}
