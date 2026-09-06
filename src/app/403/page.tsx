import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl font-bold text-warning">403</p>
      <h1 className="text-lg font-semibold">Akses ditolak</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Anda tidak memiliki izin untuk mengakses halaman ini. Hubungi admin desa jika seharusnya Anda punya akses.
      </p>
      <Link href="/admin" className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
        Kembali ke dashboard
      </Link>
    </main>
  );
}
