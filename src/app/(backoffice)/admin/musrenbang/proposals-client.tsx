"use client";

import * as React from "react";
import { Plus, ThumbsUp, CheckCircle2, XCircle, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, StatCard } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type Proposal = {
  id: string; proposal_no: string; title: string; category: string; description: string;
  location_text: string | null; estimated_cost: string | null; estimated_beneficiaries: number | null;
  urgency: string; status: string; vote_count: number; priority_rank: number | null;
  musrenbang_year: number; proposer_name: string; is_anonymous: boolean; rejected_reason: string | null;
};

const CATEGORIES = ["jalan","drainase","jembatan","lampu","pendidikan","ekonomi","fasilitas_umum","kesehatan","lainnya"];

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted" | "default"> = {
  submitted: "warning", verified: "default", in_musrenbang: "default", prioritized: "default",
  approved: "success", planned: "success", in_progress: "success", completed: "success", rejected: "destructive",
};

export function ProposalsClient() {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<Proposal[] | null>(null);
  const [statusFilter, setStatusFilter] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", category: "jalan", description: "", locationText: "", estimatedCost: "", estimatedBeneficiaries: "", urgency: "normal", isAnonymous: false });

  const load = React.useCallback(async () => {
    const params = statusFilter ? `?status=${statusFilter}` : "";
    const res = await fetch(`/api/proposals${params}`);
    const json = await res.json();
    if (json.ok) setRows(json.data.proposals);
    else { setRows([]); toast(json.error ?? "Gagal memuat", "error"); }
  }, [statusFilter, toast]);

  React.useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/proposals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title, category: form.category, description: form.description,
        locationText: form.locationText || null,
        estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : null,
        estimatedBeneficiaries: form.estimatedBeneficiaries ? Number(form.estimatedBeneficiaries) : null,
        urgency: form.urgency, isAnonymous: form.isAnonymous,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast(`Usulan tercatat: ${json.data.proposalNo}`, "success"); setCreateOpen(false); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    setSaving(true);
    const res = await fetch("/api/proposals", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, ...extra }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Status diperbarui", "success"); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function vote(id: string) {
    const res = await fetch("/api/proposals/vote", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposalId: id }),
    });
    const json = await res.json();
    if (json.ok) { toast("Suara tercatat (input musyawarah)", "success"); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  const active = (rows ?? []).filter((p) => !["completed", "rejected"].includes(p.status));

  return (
    <div>
      <PageHeader
        title="E-Musrenbang"
        description="Usulan pembangunan partisipatif: warga mengusulkan, desa memprioritaskan lewat musyawarah"
        actions={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Usulan Baru</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Usulan" value={rows?.length ?? "-"} />
        <StatCard label="Sedang Proses" value={active.length} />
        <StatCard label="Selesai" value={rows?.filter((p) => p.status === "completed").length ?? "-"} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Daftar Usulan</CardTitle>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
            <option value="">Semua status</option>
            <option value="submitted">Diajukan</option>
            <option value="verified">Terverifikasi</option>
            <option value="in_musrenbang">Musrenbang</option>
            <option value="prioritized">Diprioritaskan</option>
            <option value="approved">Disetujui</option>
            <option value="planned">Direncanakan</option>
            <option value="in_progress">Dikerjakan</option>
            <option value="completed">Selesai</option>
            <option value="rejected">Ditolak</option>
          </Select>
        </CardHeader>
        <CardContent className="pt-2">
          {rows === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Memuat...</p>
          ) : rows.length === 0 ? (
            <EmptyState icon={TrendingUp} title="Belum ada usulan" description="Usulan pembangunan dari warga akan tampil di sini." />
          ) : (
            <DataTable
              rows={rows}
              columns={[
                { key: "title", header: "Usulan", render: (p) => (<div><p className="font-medium">{p.title}</p><p className="text-xs text-muted-foreground">{p.proposal_no} · {p.category} · {p.location_text ?? "-"}</p></div>) },
                { key: "cost", header: "Estimasi Biaya", render: (p) => p.estimated_cost ? `Rp ${Number(p.estimated_cost).toLocaleString("id-ID")}` : "-" },
                { key: "votes", header: "Dukungan", render: (p) => (<button className="flex items-center gap-1 hover:text-primary focus-ring rounded" onClick={() => vote(p.id)} aria-label="Dukung usulan"><ThumbsUp className="h-4 w-4" /> {p.vote_count}</button>) },
                { key: "rank", header: "Prioritas", render: (p) => p.priority_rank ? `#${p.priority_rank}` : "-" },
                { key: "status", header: "Status", render: (p) => <Badge variant={STATUS_VARIANT[p.status] ?? "muted"}>{p.status.replace(/_/g, " ")}</Badge> },
                { key: "actions", header: "", className: "text-right", render: (p) => (
                  <div className="flex justify-end gap-1">
                    {p.status === "submitted" && <Button variant="ghost" size="sm" onClick={() => act(p.id, "verify")} aria-label="Verifikasi"><CheckCircle2 className="h-4 w-4" /></Button>}
                    {p.status === "verified" && <Button variant="ghost" size="sm" onClick={() => act(p.id, "musrenbang")} aria-label="Ke musrenbang"><TrendingUp className="h-4 w-4" /></Button>}
                    {p.status === "in_musrenbang" && <Button variant="ghost" size="sm" onClick={() => act(p.id, "prioritize", { priorityRank: 1 })} aria-label="Prioritaskan">#</Button>}
                    {p.status === "prioritized" && <Button variant="ghost" size="sm" onClick={() => act(p.id, "approve")} aria-label="Setujui"><CheckCircle2 className="h-4 w-4" /></Button>}
                    {p.status === "approved" && <Button variant="ghost" size="sm" onClick={() => act(p.id, "plan")} aria-label="Rencanakan">Rencana</Button>}
                    {p.status === "planned" && <Button variant="ghost" size="sm" onClick={() => act(p.id, "progress")} aria-label="Kerjakan">Kerjakan</Button>}
                    {p.status === "in_progress" && <Button variant="ghost" size="sm" onClick={() => act(p.id, "complete")} aria-label="Selesai">Selesai</Button>}
                    {["submitted", "verified"].includes(p.status) && <Button variant="ghost" size="sm" onClick={() => act(p.id, "reject", { notes: "Tidak masuk prioritas" })} aria-label="Tolak"><XCircle className="h-4 w-4 text-destructive" /></Button>}
                  </div>
                )},
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Usulan Pembangunan" className="max-w-2xl">
        <form onSubmit={create} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pr-cat">Kategori</Label>
              <Select id="pr-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="pr-urg">Urgensi</Label>
              <Select id="pr-urg" value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })}>
                <option value="low">Rendah</option><option value="normal">Normal</option>
                <option value="high">Tinggi</option><option value="urgent">Mendesak</option>
              </Select>
            </div>
          </div>
          <div><Label htmlFor="pr-title">Judul Usulan</Label><Input id="pr-title" required minLength={5} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Perbaikan jalan Dusun I" /></div>
          <div><Label htmlFor="pr-desc">Deskripsi</Label><Textarea id="pr-desc" required minLength={10} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label htmlFor="pr-loc">Lokasi</Label><Input id="pr-loc" value={form.locationText} onChange={(e) => setForm({ ...form, locationText: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="pr-cost">Estimasi Biaya (Rp)</Label><Input id="pr-cost" type="number" min="0" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} /></div>
            <div><Label htmlFor="pr-ben">Estimasi Penerima Manfaat</Label><Input id="pr-ben" type="number" min="0" value={form.estimatedBeneficiaries} onChange={(e) => setForm({ ...form, estimatedBeneficiaries: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isAnonymous} onChange={(e) => setForm({ ...form, isAnonymous: e.target.checked })} />
            Usul sebagai anonim
          </label>
          <p className="text-xs text-muted-foreground">Dukungan warga (vote) adalah masukan untuk musyawarah, bukan penentu otomatis keputusan desa.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Kirim Usulan"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
