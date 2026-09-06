"use client";

import * as React from "react";
import { Users, FileText, AlertTriangle, Store, HeartHandshake, Wallet, Boxes, HardHat, Info, FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, StatCard } from "@/components/ui/data-display";
import { Button } from "@/components/ui/button";

type HealthScore = { dimension: string; score: string; detail: string };

type Analytics = {
  population: { total_residents: number; male: number; female: number; under_5: number; elderly: number } | null;
  letters: { total_letters: number; issued: number; in_progress: number; avg_days_to_issue: string | null } | null;
  complaints: { total_complaints: number; unresolved: number; resolved: number; avg_rating: string | null } | null;
  economy: { umkm_count: number; farm_count: number; bumdes_profit: string } | null;
  aid: { program_count: number; distributed: number; not_claimed: number } | null;
  finance: { year: number; total_planned: string; total_realized: string }[];
  assets: { total_assets: number; rusak_ringan: number; rusak_berat: number; total_value: string } | null;
  projects: { total_proposals: number; planned: number; in_progress: number; completed: number } | null;
  healthScore: { dimensions: HealthScore[]; disclaimer: string };
};

const DIM_ICON: Record<string, React.ReactNode> = {
  pelayanan: <FileText className="h-4 w-4" />,
  ekonomi: <Store className="h-4 w-4" />,
  sosial: <HeartHandshake className="h-4 w-4" />,
  pembangunan: <HardHat className="h-4 w-4" />,
  administrasi: <FileText className="h-4 w-4" />,
  lingkungan: <Boxes className="h-4 w-4" />,
};

function scoreColor(score: string): string {
  const s = Number(score);
  if (s >= 75) return "text-success";
  if (s >= 50) return "text-warning";
  return "text-destructive";
}

export function AnalyticsClient() {
  const [data, setData] = React.useState<Analytics | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/analytics").then((r) => r.json()).then((json) => {
      if (json.ok) setData(json.data);
      else setError(json.error ?? "Gagal memuat");
    });
  }, []);

  function exportCsv() {
    if (!data) return;
    const lines: string[] = ["Metrik,Nilai"];
    if (data.population) lines.push(`Total Penduduk,${data.population.total_residents}`, `Laki-laki,${data.population.male}`, `Perempuan,${data.population.female}`);
    if (data.letters) lines.push(`Total Surat,${data.letters.total_letters}`, `Surat Terbit,${data.letters.issued}`);
    if (data.complaints) lines.push(`Total Pengaduan,${data.complaints.total_complaints}`, `Belum Selesai,${data.complaints.unresolved}`);
    if (data.assets) lines.push(`Total Aset,${data.assets.total_assets}`, `Nilai Aset,${data.assets.total_value}`);
    data.healthScore.dimensions.forEach((d) => lines.push(`Skor ${d.dimension},${d.score}`));
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-eksekutif-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!data) return <p className="p-6 text-sm text-muted-foreground">Memuat dashboard...</p>;

  const fin = data.finance[0];

  return (
    <div>
      <PageHeader
        title="Dashboard Eksekutif"
        description="Ringkasan kondisi desa untuk pengambilan keputusan kepala desa"
        actions={<Button variant="outline" onClick={exportCsv}><FileDown className="h-4 w-4" /> Ekspor CSV</Button>}
      />

      <Card>
        <CardHeader><CardTitle>Village Health Score (6 Dimensi)</CardTitle></CardHeader>
        <CardContent className="pt-2">
          <p className="mb-3 flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2 text-xs text-primary">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {data.healthScore.disclaimer}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.healthScore.dimensions.map((d) => (
              <div key={d.dimension} className="rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-medium capitalize">{DIM_ICON[d.dimension]} {d.dimension}</p>
                  <p className={"text-2xl font-bold " + scoreColor(d.score)}>{Number(d.score)}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{d.detail}</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(Number(d.score), 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Penduduk Aktif" value={String(data.population?.total_residents ?? 0)} icon={<Users className="h-5 w-5" />} hint={`${data.population?.male ?? 0} L / ${data.population?.female ?? 0} P`} />
        <StatCard label="Surat Terbit" value={String(data.letters?.issued ?? 0)} icon={<FileText className="h-5 w-5" />} hint={`${data.letters?.in_progress ?? 0} masih proses`} />
        <StatCard label="Pengaduan Belum Selesai" value={String(data.complaints?.unresolved ?? 0)} icon={<AlertTriangle className="h-5 w-5" />} hint={`rating ${data.complaints?.avg_rating ?? "-"}/5`} />
        <StatCard label="UMKM" value={String(data.economy?.umkm_count ?? 0)} icon={<Store className="h-5 w-5" />} hint={`${data.economy?.farm_count ?? 0} unit produksi`} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Bantuan Disalurkan" value={String(data.aid?.distributed ?? 0)} icon={<HeartHandshake className="h-5 w-5" />} hint={`${data.aid?.not_claimed ?? 0} tidak diambil`} />
        <StatCard label="Aset Desa" value={String(data.assets?.total_assets ?? 0)} icon={<Boxes className="h-5 w-5" />} hint={`rusak berat ${data.assets?.rusak_berat ?? 0}`} />
        <StatCard label="Pembangunan Selesai" value={String(data.projects?.completed ?? 0)} icon={<HardHat className="h-5 w-5" />} hint={`${data.projects?.in_progress ?? 0} berjalan`} />
        <StatCard
          label="Realisasi Anggaran"
          value={fin ? `${Number(fin.total_realized).toLocaleString("id-ID")}` : "-"}
          icon={<Wallet className="h-5 w-5" />}
          hint={fin ? `dari rencana ${Number(fin.total_planned).toLocaleString("id-ID")}` : "belum ada anggaran"}
        />
      </div>
    </div>
  );
}
