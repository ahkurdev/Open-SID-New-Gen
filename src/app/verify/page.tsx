"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type VerifyResult = {
  title: string; docNumber: string | null; docType: string;
  villageName: string; issuedAt: string | null; valid: boolean;
};

export default function VerifyPage() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    const res = await fetch("/api/verify-document", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const json = await res.json();
    setLoading(false);
    if (json.ok) setResult(json.data);
    else setError(json.error ?? "Verifikasi gagal");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <ShieldCheck className="mx-auto mb-1 h-10 w-10 text-primary" />
          <CardTitle>Verifikasi Dokumen Desa</CardTitle>
          <CardDescription>
            Masukkan kode verifikasi yang tertera pada dokumen untuk memeriksa keasliannya.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={verify} className="space-y-4">
            <div>
              <Label htmlFor="code">Kode Verifikasi</Label>
              <Input id="code" required value={code} onChange={(e) => setCode(e.target.value.trim())}
                placeholder="mis. a1b2c3d4e5f6" className="text-center font-mono tracking-widest" />
            </div>
            {error && <p className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || code.length < 6}>
              {loading ? "Memeriksa..." : "Periksa Keaslian"}
            </Button>
          </form>

          {result && (
            <div className={"mt-5 rounded-xl border p-4 " + (result.valid ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40" : "border-destructive bg-destructive-soft")}>
              {result.valid ? (
                <>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-300">Dokumen Terverifikasi</p>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Judul</dt><dd className="text-right font-medium">{result.title}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Nomor</dt><dd className="text-right">{result.docNumber ?? "-"}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Jenis</dt><dd className="text-right">{result.docType}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Desa</dt><dd className="text-right">{result.villageName}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Terbit</dt><dd className="text-right">{result.issuedAt ?? "-"}</dd></div>
                  </dl>
                </>
              ) : (
                <p className="font-semibold text-destructive">Dokumen sudah tidak berlaku (dihapus/dicabut)</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
