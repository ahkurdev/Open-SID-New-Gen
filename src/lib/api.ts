import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { NextRequest } from "next/server";
import { getAuthContext } from "./auth";
import type { AuthContext } from "./db";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export async function requireAuth(req: NextRequest): Promise<AuthContext | null> {
  return getAuthContext(req);
}

export function handleApiError(e: unknown) {
  if (e instanceof ZodError) {
    return fail("Validasi gagal", 422, {
      issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  console.error("[api]", e);
  return fail("Terjadi kesalahan internal", 500);
}
