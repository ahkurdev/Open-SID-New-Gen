"use client";

import * as React from "react";
import { Plus, CheckCircle2, ClipboardList, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, StatCard } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type Task = {
  id: string; title: string; description: string | null; status: string;
  priority: string; due_date: string | null; assignee_name: string | null;
  recurrence: string; overdue: boolean;
};

const PRIORITY_VARIANT: Record<string, "destructive" | "warning" | "default" | "muted"> = {
  urgent: "destructive", high: "warning", normal: "default", low: "muted",
};

export function WorkspaceClient() {
  const { toast } = useToast();
  const [tab, setTab] = React.useState<"tasks" | "reports">("tasks");
  const [tasks, setTasks] = React.useState<Task[] | null>(null);
  const [stats, setStats] = React.useState<{ todo: number; in_progress: number; done: number; overdue: number } | null>(null);
  const [reports, setReports] = React.useState<{ id: string; report_date: string; activity: string; location: string | null; description: string | null; output: string | null; hours: number | null; user_name: string }[] | null>(null);
  const [monthly, setMonthly] = React.useState<{ month: string; total_activities: number; total_hours: string; staff_active: number }[]>([]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [taskForm, setTaskForm] = React.useState({ title: "", description: "", priority: "normal", dueDate: "", recurrence: "none" });
  const [reportForm, setReportForm] = React.useState({ reportDate: new Date().toISOString().slice(0, 10), activity: "", location: "", description: "", output: "", hours: "" });

  const load = React.useCallback(async () => {
    const [t, r] = await Promise.all([fetch("/api/tasks"), fetch("/api/activity-reports")]);
    const tj = await t.json();
    const rj = await r.json();
    if (tj.ok) { setTasks(tj.data.tasks); setStats(tj.data.stats); }
    if (rj.ok) { setReports(rj.data.reports); setMonthly(rj.data.monthly); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: taskForm.title, description: taskForm.description || null,
        priority: taskForm.priority, dueDate: taskForm.dueDate || null,
        recurrence: taskForm.recurrence,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Tugas dibuat", "success"); setCreateOpen(false); setTaskForm({ title: "", description: "", priority: "normal", dueDate: "", recurrence: "none" }); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function completeTask(id: string) {
    const res = await fetch("/api/tasks", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "done" }),
    });
    const json = await res.json();
    if (json.ok) { toast("Tugas selesai", "success"); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function createReport(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/activity-reports", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportDate: reportForm.reportDate, activity: reportForm.activity,
        location: reportForm.location || null, description: reportForm.description || null,
        output: reportForm.output || null, hours: reportForm.hours ? Number(reportForm.hours) : null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Laporan kegiatan tersimpan", "success"); setReportOpen(false); setReportForm({ reportDate: new Date().toISOString().slice(0, 10), activity: "", location: "", description: "", output: "", hours: "" }); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  return (
    <div>
      <PageHeader
        title="Workspace Kerja"
        description="Task management dan laporan kegiatan harian perangkat desa"
        actions={
          <>
            <Button variant="outline" onClick={() => setReportOpen(true)}><FileText className="h-4 w-4" /> Laporan Kegiatan</Button>
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Tugas Baru</Button>
          </>
        }
      />

      <div className="mb-4 flex gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
        <button onClick={() => setTab("tasks")} className={"rounded-md px-3 py-1.5 text-sm " + (tab === "tasks" ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>Tugas</button>
        <button onClick={() => setTab("reports")} className={"rounded-md px-3 py-1.5 text-sm " + (tab === "reports" ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>Laporan Kegiatan</button>
      </div>

      {tab === "tasks" && (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-4">
            <StatCard label="To Do" value={stats?.todo ?? "-"} />
            <StatCard label="Diproses" value={stats?.in_progress ?? "-"} />
            <StatCard label="Selesai" value={stats?.done ?? "-"} />
            <StatCard label="Terlambat" value={stats?.overdue ?? "-"} />
          </div>
          <Card>
            <CardHeader><CardTitle>Daftar Tugas</CardTitle></CardHeader>
            <CardContent className="pt-2">
              {tasks === null ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Memuat...</p>
              ) : tasks.length === 0 ? (
                <EmptyState icon={ClipboardList} title="Belum ada tugas" description="Buat tugas pertama untuk tim Anda." />
              ) : (
                <DataTable
                  rows={tasks}
                  columns={[
                    { key: "title", header: "Tugas", render: (t) => (<div><p className="font-medium">{t.title}</p>{t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}</div>) },
                    { key: "assignee", header: "PIC", render: (t) => t.assignee_name ?? "-" },
                    { key: "priority", header: "Prioritas", render: (t) => <Badge variant={PRIORITY_VARIANT[t.priority] ?? "muted"}>{t.priority}</Badge> },
                    { key: "due", header: "Deadline", render: (t) => (<span className={t.overdue ? "text-destructive" : ""}>{t.due_date ?? "-"}{t.overdue ? " (lewat)" : ""}</span>) },
                    { key: "status", header: "Status", render: (t) => <Badge variant={t.status === "done" ? "success" : t.status === "in_progress" ? "default" : "muted"}>{t.status.replace(/_/g, " ")}</Badge> },
                    { key: "actions", header: "", className: "text-right", render: (t) => t.status !== "done" && t.status !== "cancelled" ? (
                      <Button variant="ghost" size="sm" onClick={() => completeTask(t.id)} aria-label="Selesaikan"><CheckCircle2 className="h-4 w-4" /></Button>
                    ) : null },
                  ]}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {tab === "reports" && (
        <>
          {monthly.length > 0 && (
            <div className="mb-4 grid gap-4 sm:grid-cols-3">
              {monthly.slice(0, 3).map((m) => (
                <StatCard key={m.month} label={`Laporan ${m.month}`} value={m.total_activities} hint={`${m.total_hours} jam · ${m.staff_active} petugas`} />
              ))}
            </div>
          )}
          <Card>
            <CardHeader><CardTitle>Laporan Kegiatan Harian</CardTitle></CardHeader>
            <CardContent className="pt-2">
              {reports === null ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Memuat...</p>
              ) : reports.length === 0 ? (
                <EmptyState icon={FileText} title="Belum ada laporan" description="Catat kegiatan harian untuk rekap otomatis." />
              ) : (
                <DataTable
                  rows={reports}
                  columns={[
                    { key: "date", header: "Tanggal", render: (r) => new Date(r.report_date).toLocaleDateString("id-ID") },
                    { key: "user", header: "Petugas", render: (r) => r.user_name },
                    { key: "activity", header: "Kegiatan", render: (r) => (<div><p className="font-medium">{r.activity}</p>{r.location && <p className="text-xs text-muted-foreground">{r.location}</p>}</div>) },
                    { key: "output", header: "Output", render: (r) => r.output ?? "-" },
                    { key: "hours", header: "Jam", render: (r) => r.hours ?? "-" },
                  ]}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Tugas Baru">
        <form onSubmit={createTask} className="space-y-4">
          <div><Label htmlFor="t-title">Judul</Label><Input id="t-title" required minLength={3} value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} /></div>
          <div><Label htmlFor="t-desc">Deskripsi</Label><Textarea id="t-desc" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="t-pri">Prioritas</Label>
              <Select id="t-pri" value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}>
                <option value="low">Rendah</option><option value="normal">Normal</option>
                <option value="high">Tinggi</option><option value="urgent">Urgent</option>
              </Select>
            </div>
            <div><Label htmlFor="t-due">Deadline</Label><Input id="t-due" type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} /></div>
            <div>
              <Label htmlFor="t-rec">Berulang</Label>
              <Select id="t-rec" value={taskForm.recurrence} onChange={(e) => setTaskForm({ ...taskForm, recurrence: e.target.value })}>
                <option value="none">Tidak</option><option value="daily">Harian</option>
                <option value="weekly">Mingguan</option><option value="monthly">Bulanan</option>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Laporan Kegiatan Harian">
        <form onSubmit={createReport} className="space-y-4">
          <div><Label htmlFor="r-date">Tanggal</Label><Input id="r-date" type="date" required value={reportForm.reportDate} onChange={(e) => setReportForm({ ...reportForm, reportDate: e.target.value })} /></div>
          <div><Label htmlFor="r-act">Kegiatan</Label><Input id="r-act" required minLength={3} value={reportForm.activity} onChange={(e) => setReportForm({ ...reportForm, activity: e.target.value })} placeholder="Pendampingan posyandu" /></div>
          <div><Label htmlFor="r-loc">Lokasi</Label><Input id="r-loc" value={reportForm.location} onChange={(e) => setReportForm({ ...reportForm, location: e.target.value })} /></div>
          <div><Label htmlFor="r-desc">Deskripsi</Label><Textarea id="r-desc" value={reportForm.description} onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="r-out">Output</Label><Input id="r-out" value={reportForm.output} onChange={(e) => setReportForm({ ...reportForm, output: e.target.value })} /></div>
            <div><Label htmlFor="r-hours">Durasi (jam)</Label><Input id="r-hours" type="number" step="0.5" min="0" max="24" value={reportForm.hours} onChange={(e) => setReportForm({ ...reportForm, hours: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setReportOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
