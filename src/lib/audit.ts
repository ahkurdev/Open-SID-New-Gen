import type { NextRequest } from "next/server";
import type { AuthContext, Queryable } from "./db";

function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || null;
}

export async function writeAudit(
  ctx: AuthContext | null,
  req: NextRequest,
  q: Queryable,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    oldValues?: unknown;
    newValues?: unknown;
  }
) {
  const ip = clientIp(req);
  await q.query(
    `INSERT INTO audit_logs (village_id, actor_user_id, actor_email, action, entity_type, entity_id, old_values, new_values, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      ctx?.villageId ?? null,
      ctx?.userId ?? null,
      ctx?.email ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.oldValues ? JSON.stringify(entry.oldValues) : null,
      entry.newValues ? JSON.stringify(entry.newValues) : null,
      ip,
      req.headers.get("user-agent"),
    ]
  );
}
