"use client";

import * as React from "react";
import { Plus, AlertTriangle, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, StatCard } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type Plan = {
  id: string; category: string; name: string; code: string | null;
  planned_amount: string; realized_amount: string;
};
type Anomaly = { id: string; trx_date: string; amount: string; description: string; anomaly_flag: string; anomaly_note: string | null };
type Monthly = { month: string; pemasukan: string; pengeluaran: string };

function rupiah(n: string | number) {
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}

export function FinanceClient() {
  const { toast } = useToast();
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [plans, setPlans] = React.useState<Plan[] | null>(null);
  const [summary, setSummary] = React.useState<{ total_pemasukan: string; total_pengeluaran: string; total_transaksi: number; anomalies: number } | null>(null);
  const [monthly, setMonthly] = React.useState<Monthly[]>([]);
  const [anomalies, setAnomalies] = React.useState<Anomaly[]>([]);
  const [trxOpen, setTrxOpen] = React.useState(false);
  const [planOpen, setPlanOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [trxForm, setTrxForm] = React.useState({ trxType: "pengeluaran", amount: "", trxDate: new Date().toISOString().slice(0, 10), description: "", referenceNo: "" });
  const [planForm, setPlanForm] = React.useState({ category: "belanja", name: "", plannedAmount: "" });

  const load = React.useCallback(async () => {
    const res = await fetch(`/api/finance?year=${year}`);
    const json = await res.json();
    if (json.ok) {
      setPlans(json.data.plans);
      setSummary(json.data.summary);
      setMonthly(json.data.monthly);
      setAnomalies(json.data.anomalies);
    } else {
      toast(json.error ?? "Gagal memuat", "error");
    }
  }, [year, toast]);

  React.useEffect(() => { load(); }, [load]);

  async function addTrx(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/finance", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "transaction", ...trxForm, amount: Number(trxForm.amount) }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) {
      toast(json.data.anomalyFlag ? `Tersimpan dengan flag anomali: ${json.data.anomalyFlag}` : "Transaksi tersimpan", json.data.anomalyFlag ? "error" : "success");
      setTrxOpen(false); setTrxForm({ trxType: "pengeluaran", amount: "", trxDate: new Date().toISOString().slice(0, 10), description: "", referenceNo: "" });
      load();
    } else toast(json.error ?? "Gagal", "error");
  }

  async function addPlan(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/finance", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "plan", year, category: planForm.category, name: planForm.name, plannedAmount: Number(planForm.plannedAmount) }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Pos anggaran disimpan", "success"); setPlanOpen(false); setPlanForm({ category: "belanja", name: "", plannedAmount: "" }); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  const plannedTotal = (plans ?? []).filter((p) => p.category === "belanja").reduce((s, p) => s + Number(p.planned_amount), 0);
  const realizedTotal = (plans ?? []).filter((p) => p.category === "belanja").reduce((s, p) => s + Number(p.realized_amount), 0);
  const burnRate = plannedTotal > 0 ? Math.round((realizedTotal / plannedTotal) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Keuangan Desa"
        description="Monitoring anggaran dan realisasi - bukan pengganti sistem resmi pemerintah"
        actions={
          <>
            <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24" />
            <Button variant="outline" onClick={() => setPlanOpen(true)}>Pos Anggaran</Button>
            <Button onClick={() => setTrxOpen(true)}><Plus className="h-4 w-4" /> Transaksi</Button>
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <StatCard label="Total Pemasukan" value={summary ? rupiah(summary.total_pemasukan) : "-"} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Total Pengeluaran" value={summary ? rupiah(summary.total_pengeluaran) : "-"} icon={<TrendingDown className="h-4 w-4" />} />
        <StatCard label="Burn Rate Belanja" value={`${burnRate}%`} icon={<Wallet className="h-4 w-4" />} hint={plannedTotal > 0 ? `dari ${rupiah(plannedTotal)}` : undefined} />
        <StatCard label="Flag Anomali" value={summary?.anomalies ?? "-"} icon={<AlertTriangle className="h-4 w-4" />} hint="perlu verifikasi manual" />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Anggaran vs Realisasi</CardTitle></CardHeader>
          <CardContent>
            {plans === null ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Memuat...</p>
            ) : plans.length === 0 ? (
              <EmptyState icon={Wallet} title="Belum ada pos anggaran" description="Tambahkan pos anggaran untuk tahun berjalan." />
            ) : (
              <div className="space-y-3">
                {plans.map((p) => {
                  const planned = Number(p.planned_amount);
                  const realized = Number(p.realized_amount);
                  const pct = planned > 0 ? Math.min(100, Math.round((Math.abs(realized) / planned) * 100)) : 0;
                  return (
                    <div key={p.id}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium">{p.name} <Badge variant="muted">{p.category}</Badge></span>
                        <span className="text-xs text-muted-foreground">{rupiah(Math.abs(realized))} / {rupiah(planned)} ({pct}%)</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className={"h-full rounded-full " + (pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Tren Bulanan {year}</CardTitle></CardHeader>
          <CardContent>
            {monthly.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Belum ada transaksi tahun ini.</p>
            ) : (
              <div className="space-y-2">
                {monthly.map((m) => {
                  const max = Math.max(...monthly.map((x) => Math.max(Number(x.pemasukan), Number(x.pengeluaran))), 1);
                  return (
                    <div key={m.month} className="text-xs">
                      <div className="mb-0.5 flex justify-between"><span className="font-medium">{m.month}</span><span className="text-muted-foreground">masuk {rupiah(m.pemasukan)} · keluar {rupiah(m.pengeluaran)}</span></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${(Number(m.pemasukan) / max) * 100}%` }} /></div>
                      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-destructive" style={{ width: `${(Number(m.pengeluaran) / max) * 100}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {anomalies.length > 0 && (
        <Card className="border-warning">
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Anomali Terdeteksi (warning, keputusan tetap manusia)</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              rows={anomalies}
              columns={[
                { key: "date", header: "Tanggal", render: (a) => new Date(a.trx_date).toLocaleDateString("id-ID") },
                { key: "amount", header: "Nilai", render: (a) => rupiah(a.amount) },
                { key: "desc", header: "Deskripsi", render: (a) => a.description },
                { key: "flag", header: "Flag", render: (a) => <Badge variant="warning">{a.anomaly_flag}</Badge> },
              ]}
            />
          </CardContent>
        </Card>
      )}

      <Modal open={trxOpen} onClose={() => setTrxOpen(false)} title="Catat Transaksi">
        <form onSubmit={addTrx} className="space-y-4">
          <div>
            <Label htmlFor="fx-type">Jenis</Label>
            <Select id="fx-type" value={trxForm.trxType} onChange={(e) => setTrxForm({ ...trxForm, trxType: e.target.value })}>
              <option value="pengeluaran">Pengeluaran</option>
              <option value="pemasukan">Pemasukan</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="fx-amount">Nilai (Rp)</Label><Input id="fx-amount" type="number" min="1" required value={trxForm.amount} onChange={(e) => setTrxForm({ ...trxForm, amount: e.target.value })} /></div>
            <div><Label htmlFor="fx-date">Tanggal</Label><Input id="fx-date" type="date" required value={trxForm.trxDate} onChange={(e) => setTrxForm({ ...trxForm, trxDate: e.target.value })} /></div>
          </div>
          <div><Label htmlFor="fx-desc">Deskripsi</Label><Textarea id="fx-desc" required minLength={3} value={trxForm.description} onChange={(e) => setTrxForm({ ...trxForm, description: e.target.value })} /></div>
          <div><Label htmlFor="fx-ref">No. Referensi (opsional)</Label><Input id="fx-ref" value={trxForm.referenceNo} onChange={(e) => setTrxForm({ ...trxForm, referenceNo: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setTrxOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={planOpen} onClose={() => setPlanOpen(false)} title="Pos Anggaran">
        <form onSubmit={addPlan} className="space-y-4">
          <div>
            <Label htmlFor="bp-cat">Kategori</Label>
            <Select id="bp-cat" value={planForm.category} onChange={(e) => setPlanForm({ ...planForm, category: e.target.value })}>
              <option value="pendapatan">Pendapatan</option>
              <option value="belanja">Belanja</option>
              <option value="pembiayaan">Pembiayaan</option>
            </Select>
          </div>
          <div><Label htmlFor="bp-name">Nama Pos</Label><Input id="bp-name" required minLength={2} value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="Belanja Alat Tulis Kantor" /></div>
          <div><Label htmlFor="bp-amount">Nilai Anggaran (Rp)</Label><Input id="bp-amount" type="number" min="0" required value={planForm.plannedAmount} onChange={(e) => setPlanForm({ ...planForm, plannedAmount: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPlanOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
