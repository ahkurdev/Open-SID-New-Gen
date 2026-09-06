"use client";

import * as React from "react";
import { AlertTriangle, Plus, CheckCircle2, XCircle, UserPlus, Star, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, StatCard } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type Complaint = {
  id: string; ticket_no: string; category: string; title: string; description: string;
  status: string; priority: string; reporter_name: string; is_anonymous: boolean;
  location_text: string | null; assigned_to: string | null; assigned_name: string | null;
  sla_due_at: string | null; reporter_rating: number | null; created_at: string; overdue: boolean;
};

const CATEGORIES = ["jalan","sampah","pelayanan","bantuan","keamanan","fasilitas","lampu","banjir","administrasi","lainnya"];

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted" | "default"> = {
  new: "warning", verified: "default", assigned: "default", in_progress: "default",
  resolved: "success", closed: "muted", rejected: "destructive",
};

export function ComplaintsClient() {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<Complaint[] | null>(null);
  const [stats, setStats] = React.useState<{ total: number; active: number; resolved: number; overdue: number } | null>(null);
  const [statusFilter, setStatusFilter] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<{ complaint: Complaint & { resolution_note: string | null; rejected_reason: string | null }; timeline: { action: string; actor_name: string | null; notes: string | null; created_at: string }[]; staff: { id: string; name: string }[] } | null>(null);
  const [assignTo, setAssignTo] = React.useState("");
  const [actionNotes, setActionNotes] = React.useState("");
  const [rating, setRating] = React.useState(5);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({ category: "jalan", title: "", description: "", locationText: "", isAnonymous: false });

  const load = React.useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/complaints?${params}`);
    const json = await res.json();
    if (json.ok) { setRows(json.data.complaints); setStats(json.data.stats); }
    else { setRows([]); toast(json.error ?? "Gagal memuat", "error"); }
  }, [statusFilter, toast]);

  React.useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/complaints", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, locationText: form.locationText || null }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast(`Pengaduan tercatat: ${json.data.ticketNo}`, "success"); setCreateOpen(false); setForm({ category: "jalan", title: "", description: "", locationText: "", isAnonymous: false }); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    setSaving(true);
    const res = await fetch("/api/complaints", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, ...extra }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Berhasil", "success"); setDetail(null); setActionNotes(""); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function openDetail(id: string) {
    const res = await fetch(`/api/complaints/${id}`);
    const json = await res.json();
    if (json.ok) { setDetail(json.data); setAssignTo(json.data.complaint.assigned_to ?? ""); }
    else toast(json.error ?? "Gagal memuat", "error");
  }

  return (
    <div>
      <PageHeader
        title="Pengaduan & Aspirasi"
        description="Case management pengaduan warga dengan SLA per kategori"
        actions={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Catat Pengaduan</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <StatCard label="Total" value={stats?.total ?? "-"} icon={<Activity className="h-4 w-4" />} />
        <StatCard label="Aktif" value={stats?.active ?? "-"} />
        <StatCard label="Selesai" value={stats?.resolved ?? "-"} />
        <StatCard label="Lewat SLA" value={stats?.overdue ?? "-"} icon={<AlertTriangle className="h-4 w-4" />} hint={stats && stats.overdue > 0 ? "perlu perhatian" : undefined} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Daftar Pengaduan</CardTitle>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
            <option value="">Semua status</option>
            <option value="new">Baru</option>
            <option value="verified">Terverifikasi</option>
            <option value="assigned">Ditugaskan</option>
            <option value="in_progress">Diproses</option>
            <option value="resolved">Selesai</option>
            <option value="closed">Ditutup</option>
            <option value="rejected">Ditolak</option>
          </Select>
        </CardHeader>
        <CardContent className="pt-2">
          {rows === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Memuat...</p>
          ) : rows.length === 0 ? (
            <EmptyState icon={Activity} title="Belum ada pengaduan" description="Pengaduan warga akan tampil di sini." />
          ) : (
            <DataTable
              rows={rows}
              columns={[
                { key: "ticket", header: "Tiket", render: (c) => (<div><button className="text-left font-medium hover:text-primary focus-ring rounded" onClick={() => openDetail(c.id)}>{c.title}</button><p className="text-xs text-muted-foreground">{c.ticket_no} · {c.category}</p></div>) },
                { key: "reporter", header: "Pelapor", render: (c) => (<span className="text-xs">{c.reporter_name}{c.is_anonymous && <Badge variant="muted" className="ml-1">anonim</Badge>}</span>) },
                { key: "assigned", header: "Petugas", render: (c) => c.assigned_name ?? "-" },
                { key: "status", header: "Status", render: (c) => (<span className="flex items-center gap-1"><Badge variant={STATUS_VARIANT[c.status] ?? "muted"}>{c.status.replace(/_/g, " ")}</Badge>{c.overdue && <Badge variant="destructive">SLA</Badge>}</span>) },
                { key: "rating", header: "Rating", render: (c) => c.reporter_rating ? `${c.reporter_rating}/5` : "-" },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Catat Pengaduan">
        <form onSubmit={create} className="space-y-4">
          <div>
            <Label htmlFor="p-cat">Kategori</Label>
            <Select id="p-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div><Label htmlFor="p-title">Judul</Label><Input id="p-title" required minLength={5} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Jalan rusak di Dusun I" /></div>
          <div><Label htmlFor="p-desc">Deskripsi</Label><Textarea id="p-desc" required minLength={10} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label htmlFor="p-loc">Lokasi</Label><Input id="p-loc" value={form.locationText} onChange={(e) => setForm({ ...form, locationText: e.target.value })} placeholder="Jl. Melati depan musjid" /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isAnonymous} onChange={(e) => setForm({ ...form, isAnonymous: e.target.checked })} />
            Catat sebagai anonim
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Kirim"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={`Pengaduan: ${detail?.complaint.ticket_no ?? ""}`} className="max-w-2xl">
        {detail && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Kategori:</span> {detail.complaint.category}</div>
              <div><span className="text-muted-foreground">Status:</span> <Badge variant={STATUS_VARIANT[detail.complaint.status] ?? "muted"}>{detail.complaint.status}</Badge></div>
              <div><span className="text-muted-foreground">Pelapor:</span> {detail.complaint.reporter_name}{detail.complaint.is_anonymous ? " (anonim)" : ""}</div>
              <div><span className="text-muted-foreground">Lokasi:</span> {detail.complaint.location_text ?? "-"}</div>
              <div><span className="text-muted-foreground">SLA:</span> {detail.complaint.sla_due_at ? new Date(detail.complaint.sla_due_at).toLocaleDateString("id-ID") : "-"}</div>
              <div><span className="text-muted-foreground">Rating:</span> {detail.complaint.reporter_rating ? `${detail.complaint.reporter_rating}/5` : "-"}</div>
            </div>
            <p className="rounded-lg bg-muted/50 p-3 text-sm">{detail.complaint.description}</p>
            {detail.complaint.resolution_note && <p className="rounded-lg bg-primary-soft p-3 text-sm">Penyelesaian: {detail.complaint.resolution_note}</p>}
            {detail.complaint.rejected_reason && <p className="rounded-lg bg-destructive-soft p-3 text-sm text-destructive">Ditolak: {detail.complaint.rejected_reason}</p>}

            {["new", "verified"].includes(detail.complaint.status) && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => act(detail.complaint.id, "verify")}><CheckCircle2 className="h-4 w-4" /> Verifikasi</Button>
                  <Button size="sm" variant="destructive" onClick={() => act(detail.complaint.id, "reject", { notes: actionNotes || "Tidak valid" })}><XCircle className="h-4 w-4" /> Tolak</Button>
                </div>
                <div className="flex gap-2">
                  <Select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="flex-1">
                    <option value="">Pilih petugas...</option>
                    {detail.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                  <Button size="sm" disabled={!assignTo} onClick={() => act(detail.complaint.id, "assign", { assignedTo: assignTo })}><UserPlus className="h-4 w-4" /> Tugaskan</Button>
                </div>
              </div>
            )}
            {["assigned", "in_progress", "verified"].includes(detail.complaint.status) && detail.complaint.assigned_to && (
              <div className="space-y-2">
                <div><Label htmlFor="d-notes">Catatan progres/penyelesaian</Label><Textarea id="d-notes" value={actionNotes} onChange={(e) => setActionNotes(e.target.value)} /></div>
                <div className="flex gap-2">
                  {detail.complaint.status !== "in_progress" && <Button size="sm" onClick={() => act(detail.complaint.id, "progress")}>Mulai Proses</Button>}
                  <Button size="sm" variant="secondary" onClick={() => act(detail.complaint.id, "resolve", { notes: actionNotes })}><CheckCircle2 className="h-4 w-4" /> Tandai Selesai</Button>
                </div>
              </div>
            )}
            {detail.complaint.status === "resolved" && (
              <div className="space-y-2">
                <div><Label>Rating penyelesaian (pelapor)</Label></div>
                <div className="flex items-center gap-2">
                  <Select value={String(rating)} onChange={(e) => setRating(Number(e.target.value))} className="w-24">
                    {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
                  </Select>
                  <Button size="sm" onClick={() => act(detail.complaint.id, "rate", { rating })}><Star className="h-4 w-4" /> Beri Rating</Button>
                  <Button size="sm" variant="outline" onClick={() => act(detail.complaint.id, "close")}>Tutup Kasus</Button>
                </div>
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-medium">Timeline</p>
              <ol className="space-y-2 border-l-2 border-border pl-4">
                {detail.timeline.map((t, i) => (
                  <li key={i} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                    <p className="font-medium">{t.action}</p>
                    <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString("id-ID")} {t.actor_name ? `oleh ${t.actor_name}` : ""} {t.notes ? `- ${t.notes}` : ""}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
