"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "@/app/actions/password-actions";
import type { ActionState } from "@/app/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const initial: ActionState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initial);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>Lupa Password</CardTitle>
            <CardDescription>
              Masukkan email Anda. Jika terdaftar, kami kirim tautan reset.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {state.success ? (
              <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">{state.success}</p>
            ) : (
              <form action={formAction} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                {state.error && (
                  <p className="rounded-lg bg-destructive-soft px-3 py-2 text-xs text-destructive" role="alert">
                    {state.error}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Mengirim..." : "Kirim tautan reset"}
                </Button>
              </form>
            )}
            <p className="mt-4 text-center text-sm">
              <Link href="/login" className="text-primary hover:underline">Kembali ke login</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
