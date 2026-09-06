"use client";

import * as React from "react";
import { Plus, PhoneCall, CheckCircle2, SkipForward, PlayCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, StatCard } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type Ticket = {
  id: string; ticket_number: number; visitor_name: string; status: string;
  counter: string | null; service_name: string; avg_minutes: number;
  wait_minutes: number | null; created_at: string;
};
type Service = { id: string; name: string; avg_minutes: number };
type Stats = { total: number; served: number; active: number; avg_service_minutes: string | null };

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted" | "default"> = {
  waiting: "warning", called: "default", serving: "default", served: "success", skipped: "muted",
};

export function QueueClient() {
  const { toast } = useToast();
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [queue, setQueue] = React.useState<Ticket[] | null>(null);
  const [services, setServices] = React.useState<Service[]>([]);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [walkinOpen, setWalkinOpen] = React.useState(false);
  const [form, setForm] = React.useState({ serviceTypeId: "", visitorName: "" });
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await fetch(`/api/queue?date=${date}`);
    const json = await res.json();
    if (json.ok) {
      setQueue(json.data.queue);
      setServices(json.data.services);
      setStats(json.data.stats);
    } else {
      setQueue([]);
      toast(json.error ?? "Gagal memuat", "error");
    }
  }, [date, toast]);

  React.useEffect(() => { load(); }, [load]);

  async function walkIn(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/queue", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "walkin", serviceTypeId: form.serviceTypeId, visitorName: form.visitorName, queueDate: date }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast(`Tiket nomor ${json.data.ticketNumber} dibuat`, "success"); setWalkinOpen(false); setForm({ serviceTypeId: "", visitorName: "" }); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function act(ticketId: string, action: string) {
    const res = await fetch("/api/queue", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, action }),
    });
    const json = await res.json();
    if (json.ok) { toast("Status diperbarui", "success"); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  return (
    <div>
      <PageHeader
        title="Antrean Front Office"
        description="Kelola antrean layanan harian kantor desa"
        actions={
          <>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
            <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
            <Button onClick={() => setWalkinOpen(true)}><Plus className="h-4 w-4" /> Walk-in</Button>
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <StatCard label="Total Tiket" value={stats?.total ?? "-"} />
        <StatCard label="Sedang Aktif" value={stats?.active ?? "-"} />
        <StatCard label="Selesai" value={stats?.served ?? "-"} />
        <StatCard label="Rata-rata Layanan" value={stats?.avg_service_minutes ? `${stats.avg_service_minutes} mnt` : "-"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Daftar Antrean</CardTitle></CardHeader>
        <CardContent>
          {queue === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Memuat...</p>
          ) : queue.length === 0 ? (
            <EmptyState icon={PhoneCall} title="Antrean kosong" description="Belum ada pengunjung hari ini. Tambahkan walk-in." />
          ) : (
            <ul className="space-y-2">
              {queue.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
                  <div className="flex items-center gap-4">
                    <span className="w-12 text-center text-2xl font-bold tabular-nums text-primary">{String(t.ticket_number).padStart(3, "0")}</span>
                    <div>
                      <p className="text-sm font-medium">{t.visitor_name}</p>
                      <p className="text-xs text-muted-foreground">{t.service_name} · tunggu {t.wait_minutes != null ? `${Math.round(Number(t.wait_minutes))} mnt` : "-"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.counter && <Badge variant="muted">{t.counter}</Badge>}
                    <Badge variant={STATUS_VARIANT[t.status] ?? "muted"}>{t.status}</Badge>
                    {t.status === "waiting" && <Button size="sm" onClick={() => act(t.id, "call")}><PhoneCall className="h-3.5 w-3.5" /> Panggil</Button>}
                    {(t.status === "called" || t.status === "waiting") && <Button size="sm" variant="outline" onClick={() => act(t.id, "serve")}><PlayCircle className="h-3.5 w-3.5" /> Layani</Button>}
                    {t.status === "serving" && <Button size="sm" variant="secondary" onClick={() => act(t.id, "finish")}><CheckCircle2 className="h-3.5 w-3.5" /> Selesai</Button>}
                    {(t.status === "called" || t.status === "serving") && <Button size="sm" variant="ghost" onClick={() => act(t.id, "skip")} aria-label="Lewati"><SkipForward className="h-3.5 w-3.5" /></Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Modal open={walkinOpen} onClose={() => setWalkinOpen(false)} title="Tambah Walk-in">
        <form onSubmit={walkIn} className="space-y-4">
          <div>
            <Label htmlFor="w-service">Layanan</Label>
            <Select id="w-service" required value={form.serviceTypeId} onChange={(e) => setForm({ ...form, serviceTypeId: e.target.value })}>
              <option value="">Pilih layanan</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name} (~{s.avg_minutes} mnt)</option>)}
            </Select>
          </div>
          <div><Label htmlFor="w-name">Nama Pengunjung</Label><Input id="w-name" required value={form.visitorName} onChange={(e) => setForm({ ...form, visitorName: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setWalkinOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving || !form.serviceTypeId}>{saving ? "Menyimpan..." : "Buat Tiket"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
