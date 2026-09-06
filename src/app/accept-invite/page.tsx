"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { loginAction, type ActionState } from "@/app/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const initial: ActionState = {};

function AcceptForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const token = useSearchParams().get("token") ?? "";

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Terima Undangan</CardTitle>
      </CardHeader>
      <CardContent>
        {state.success ? (
          <div className="space-y-4">
            <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">{state.success}</p>
            <Link href="/login" className="block text-center text-sm text-primary hover:underline">
              Ke halaman login
            </Link>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <div>
              <Label htmlFor="name">Nama Lengkap</Label>
              <Input id="name" name="name" required minLength={1} />
            </div>
            <div>
              <Label htmlFor="password">Buat Password</Label>
              <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
            </div>
            {state.error && (
              <p className="rounded-lg bg-destructive-soft px-3 py-2 text-xs text-destructive" role="alert">
                {state.error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={pending || !token}>
              {pending ? "Memproses..." : token ? "Aktifkan Akun" : "Token tidak ditemukan"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function AcceptInvitePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Suspense fallback={null}>
        <AcceptForm />
      </Suspense>
    </main>
  );
}
