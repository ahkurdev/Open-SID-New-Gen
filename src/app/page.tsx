import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const FEATURES = [
  ["Pemerintahan Desa", "Penduduk, surat, keuangan, aset, dan arsip dalam satu sistem."],
  ["Pelayanan Warga", "Portal warga, antrean digital, pengaduan, dan tracking permohonan."],
  ["Transparansi Publik", "Website desa, APBDes, pembangunan, dan open data."],
  ["Smart Village", "GIS, Digital Twin, IoT, dan automation engine."],
];

export default function Home() {
  return (
    <main className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              VO
            </div>
            <span className="font-semibold">Village OS</span>
          </div>
          <Link href="/login">
            <Button variant="outline" size="sm">Login Aparat</Button>
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-20 text-center">
        <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight">
          Sistem Operasi untuk Desa
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Satu platform terpadu untuk pemerintahan, pelayanan, pembangunan, dan
          pemberdayaan desa. Dari administrasi sampai Smart Village.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/login">
            <Button size="lg">Masuk ke Sistem</Button>
          </Link>
          <Link href="/api/health">
            <Button variant="outline" size="lg">Status Sistem</Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-20 sm:grid-cols-2">
        {FEATURES.map(([title, desc]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{desc}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        Village OS - Smart Village Operating System
      </footer>
    </main>
  );
}
