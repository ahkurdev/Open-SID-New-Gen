"use client";

import * as React from "react";
import { Plus, HeartHandshake, Sparkles, CheckCircle2, XCircle, PackageCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type Program = {
  id: string; name: string; description: string | null; funding_source: string;
  period_start: string; period_end: string | null; quota: number | null; status: string;
  accepted_count: number; distributed_count: number;
};
type Recipient = {
  id: string; applicant_name: string; status: string; not_claimed_reason: string | null;
  rejection_reason: string | null; distribution_date: string | null; nik: string | null;
  resident_real_name: string | null; created_at: string;
};
type Candidate = { resident_id: string; name: string; dusun_name: string | null; score: string; factors: Record<string, unknown> };

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted" | "default"> = {
  candidate: "warning", verified: "default", accepted: "default", distributed: "success",
  rejected: "destructive", not_claimed: "muted",
};

export function AidClient() {
  const { toast } = useToast();
  const [programs, setPrograms] = React.useState<Program[] | null>(null);
  const [selected, setSelected] = React.useState<Program | null>(null);
  const [recipients, setRecipients] = React.useState<Recipient[]>([]);
  const [insight, setInsight] = React.useState<{ candidates: Candidate[]; disclaimer: string } | null>(null);
  const [insightOpen, setInsightOpen] = React.useState(false);
  const [programOpen, setProgramOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [programForm, setProgramForm] = React.useState({ name: "", description: "", fundingSource: "desa", periodStart: new Date().toISOString().slice(0, 10), periodEnd: "", quota: "" });
  const [addForm, setAddForm] = React.useState({ applicantName: "", residentId: "" });

  const load = React.useCallback(async () => {
    const res = await fetch("/api/aid");
    const json = await res.json();
    if (json.ok) setPrograms(json.data.programs);
    else toast(json.error ?? "Gagal memuat", "error");
  }, [toast]);

  React.useEffect(() => { load(); }, [load]);

  async function openProgram(p: Program) {
    setSelected(p);
    const res = await fetch(`/api/aid?programId=${p.id}`);
    const json = await res.json();
    if (json.ok) setRecipients(json.data.recipients);
  }

  async function createProgram(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/aid", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "program", name: programForm.name, description: programForm.description || null,
        fundingSource: programForm.fundingSource, periodStart: programForm.periodStart,
        periodEnd: programForm.periodEnd || null,
        quota: programForm.quota ? Number(programForm.quota) : null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Program dibuat", "success"); setProgramOpen(false); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function addRecipient(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    const res = await fetch("/api/aid", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "recipient", programId: selected.id, applicantName: addForm.applicantName, residentId: addForm.residentId || null }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Kandidat ditambahkan", "success"); setAddOpen(false); setAddForm({ applicantName: "", residentId: "" }); openProgram(selected); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function act(recipientId: string, action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/aid", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId, action, ...extra }),
    });
    const json = await res.json();
    if (json.ok) { toast("Status diperbarui", "success"); if (selected) openProgram(selected); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function loadInsight() {
    if (!selected) return;
    const res = await fetch(`/api/aid/insight?programId=${selected.id}`);
    const json = await res.json();
    if (json.ok) { setInsight(json.data); setInsightOpen(true); }
    else toast(json.error ?? "Gagal memuat insight", "error");
  }

  return (
    <div>
      <PageHeader
        title="Bantuan Sosial"
        description="Program bantuan, penerima, distribusi, dan rekomendasi kesejahteraan (explainable)"
        actions={<Button onClick={() => setProgramOpen(true)}><Plus className="h-4 w-4" /> Program Baru</Button>}
      />

      <Card>
        <CardHeader><CardTitle>Program Bantuan</CardTitle></CardHeader>
        <CardContent className="pt-2">
          {programs === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
          ) : programs.length === 0 ? (
            <EmptyState icon={HeartHandshake} title="Belum ada program" description="Buat program bantuan pertama." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {programs.map((p) => (
                <button key={p.id} onClick={() => openProgram(p)}
                  className={"rounded-xl border p-4 text-left transition-colors hover:border-primary focus-ring " + (selected?.id === p.id ? "border-primary bg-primary-soft/40" : "")}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.funding_source} · {new Date(p.period_start).toLocaleDateString("id-ID")}
                        {p.period_end ? ` s.d. ${new Date(p.period_end).toLocaleDateString("id-ID")}` : ""}
                      </p>
                    </div>
                    <Badge variant={p.status === "active" ? "success" : "muted"}>{p.status}</Badge>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    <span>Diterima: {p.accepted_count}{p.quota ? ` / ${p.quota}` : ""}</span>
                    <span>Disalurkan: {p.distributed_count}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <Card className="mt-4">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Penerima: {selected.name}</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={loadInsight}><Sparkles className="h-4 w-4" /> Rekomendasi Kandidat</Button>
              <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Tambah Kandidat</Button>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {recipients.length === 0 ? (
              <EmptyState icon={HeartHandshake} title="Belum ada kandidat" description="Tambahkan kandidat manual atau pakai rekomendasi." />
            ) : (
              <DataTable
                rows={recipients}
                columns={[
                  { key: "name", header: "Nama", render: (r) => (<div><p className="font-medium">{r.applicant_name}</p>{r.nik && <p className="text-xs text-muted-foreground">{r.nik}</p>}</div>) },
                  { key: "status", header: "Status", render: (r) => (<span className="flex flex-wrap items-center gap-1"><Badge variant={STATUS_VARIANT[r.status] ?? "muted"}>{r.status.replace(/_/g, " ")}</Badge>{r.not_claimed_reason && <Badge variant="muted">{r.not_claimed_reason.replace(/_/g, " ")}</Badge>}</span>) },
                  { key: "dist", header: "Distribusi", render: (r) => r.distribution_date ? new Date(r.distribution_date).toLocaleDateString("id-ID") : "-" },
                  { key: "actions", header: "", className: "text-right", render: (r) => (
                    <div className="flex justify-end gap-1">
                      {r.status === "candidate" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => act(r.id, "verify")}>Verifikasi</Button>
                          <Button size="sm" variant="ghost" onClick={() => act(r.id, "reject", { rejectionReason: "Tidak memenuhi kriteria" })} aria-label="Tolak"><XCircle className="h-4 w-4 text-destructive" /></Button>
                        </>
                      )}
                      {r.status === "verified" && <Button size="sm" variant="outline" onClick={() => act(r.id, "accept")}>Terima</Button>}
                      {r.status === "accepted" && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => act(r.id, "distribute")}><PackageCheck className="h-4 w-4" /> Salurkan</Button>
                          <Button size="sm" variant="ghost" onClick={() => act(r.id, "mark_not_claimed", { notClaimedReason: "tidak_ditemukan", notClaimedNote: "Ditandai manual" })} aria-label="Tidak diambil"><UserX className="h-4 w-4" /></Button>
                        </>
                      )}
                    </div>
                  )},
                ]}
              />
            )}
          </CardContent>
        </Card>
      )}

      <Modal open={programOpen} onClose={() => setProgramOpen(false)} title="Program Bantuan Baru">
        <form onSubmit={createProgram} className="space-y-4">
          <div><Label htmlFor="pg-name">Nama Program</Label><Input id="pg-name" required minLength={2} value={programForm.name} onChange={(e) => setProgramForm({ ...programForm, name: e.target.value })} placeholder="Bantuan Sembako Bulanan" /></div>
          <div><Label htmlFor="pg-desc">Deskripsi</Label><Textarea id="pg-desc" value={programForm.description} onChange={(e) => setProgramForm({ ...programForm, description: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="pg-src">Sumber Dana</Label>
              <Select id="pg-src" value={programForm.fundingSource} onChange={(e) => setProgramForm({ ...programForm, fundingSource: e.target.value })}>
                <option value="desa">Desa</option><option value="kabupaten">Kabupaten</option>
                <option value="provinsi">Provinsi</option><option value="pusat">Pusat</option><option value="donatur">Donatur</option>
              </Select>
            </div>
            <div><Label htmlFor="pg-start">Mulai</Label><Input id="pg-start" type="date" required value={programForm.periodStart} onChange={(e) => setProgramForm({ ...programForm, periodStart: e.target.value })} /></div>
            <div><Label htmlFor="pg-quota">Kuota</Label><Input id="pg-quota" type="number" min="1" value={programForm.quota} onChange={(e) => setProgramForm({ ...programForm, quota: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setProgramOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Tambah Kandidat Penerima">
        <form onSubmit={addRecipient} className="space-y-4">
          <div><Label htmlFor="ar-name">Nama Kandidat</Label><Input id="ar-name" required value={addForm.applicantName} onChange={(e) => setAddForm({ ...addForm, applicantName: e.target.value })} /></div>
          <div><Label htmlFor="ar-id">ID Penduduk (opsional, untuk link data)</Label><Input id="ar-id" value={addForm.residentId} onChange={(e) => setAddForm({ ...addForm, residentId: e.target.value })} placeholder="UUID penduduk" /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Tambah"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={insightOpen} onClose={() => setInsightOpen(false)} title="Rekomendasi Kandidat (Explainable)" className="max-w-2xl">
        <div className="space-y-3">
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-yellow-800 dark:text-yellow-300">{insight?.disclaimer}</p>
          {(insight?.candidates ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Belum ada warga dengan indikator kesejahteraan tercatat. Lengkapi data indikator saat pendataan.</p>
          ) : (
            insight!.candidates.map((c) => (
              <div key={c.resident_id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="text-sm">
                  <p className="font-medium">{c.name} <span className="text-xs text-muted-foreground">Dusun {c.dusun_name ?? "-"}</span></p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Faktor: {[
                      Number(c.factors.elderly) > 0 && `lansia x${c.factors.elderly}`,
                      Number(c.factors.disable_count) > 0 && `disabilitas x${c.factors.disable_count}`,
                      c.factors.single_parent === "true" && "single parent",
                      c.factors.no_income === "true" && "tanpa penghasilan",
                      c.factors.children_under_5 === "true" && "balita",
                    ].filter(Boolean).join(", ") || "-"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary">{Number(c.score)}</p>
                  <Button size="sm" variant="outline" onClick={() => { if (selected) { submitCandidate(selected.id, c.resident_id, c.name); setInsightOpen(false); } }}>Tambah</Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );

  async function submitCandidate(programId: string, residentId: string, name: string) {
    const res = await fetch("/api/aid", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "recipient", programId, residentId, applicantName: name }),
    });
    const json = await res.json();
    if (json.ok) { toast("Kandidat dari rekomendasi ditambahkan", "success"); if (selected) openProgram(selected); }
    else toast(json.error ?? "Gagal", "error");
  }
}
