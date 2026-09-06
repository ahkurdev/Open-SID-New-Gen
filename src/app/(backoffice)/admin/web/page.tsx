import { getSession } from "@/lib/session-server";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { PostsClient } from "./posts-client";

export const dynamic = "force-dynamic";

export default async function WebPage() {
  const session = (await getSession())!;
  const allowed = await withAuth(session, (q) => hasPermission(session, q, "public.publish"));
  if (!allowed) redirect("/403");
  return <PostsClient />;
}
