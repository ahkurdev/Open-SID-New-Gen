export type Executor = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>;
};

export async function getPermissions(ctx: { userId: string }, q: Executor): Promise<string[]> {
  const r = await q.query(
    `SELECT COALESCE(array_agg(DISTINCT p), '{}') AS perms
     FROM user_roles ur
     JOIN roles ro ON ro.id = ur.role_id,
          unnest(ro.permissions) AS p
     WHERE ur.user_id = $1`,
    [ctx.userId]
  );
  const perms = r.rows[0] as { perms?: string[] } | undefined;
  return perms?.perms ?? [];
}

export async function hasPermission(
  ctx: { userId: string; isPlatformAdmin: boolean },
  q: Executor,
  permission: string
): Promise<boolean> {
  if (ctx.isPlatformAdmin) return true;
  const perms = await getPermissions(ctx, q);
  return perms.includes("*") || perms.includes(permission);
}
