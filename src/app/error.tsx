"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl font-bold text-destructive">500</p>
      <h1 className="text-lg font-semibold">Terjadi kesalahan server</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {error.digest ? `Kode error: ${error.digest}. ` : ""}Coba lagi, atau hubungi administrator jika berlanjut.
      </p>
      <div className="mt-2 flex gap-2">
        <button onClick={reset} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          Coba lagi
        </button>
        <Link href="/" className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">
          Ke beranda
        </Link>
      </div>
    </main>
  );
}
