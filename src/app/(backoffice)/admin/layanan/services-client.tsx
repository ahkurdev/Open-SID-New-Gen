"use client";

import * as React from "react";
import { Plus, HeartPulse, GraduationCap, Sparkles, CheckCircle2, XCircle, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, StatCard } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type HealthProgram = { id: string; name: string; program_type: string; description: string | null; schedule_text: string | null; location_text: string | null; is_active: boolean; visit_count: number; total_participants: number };
type HealthVisit = { id: string; visit_date: string; participant_count: number; notes: string | null; program_name: string; resident_name: string | null };
type School = { id: string; name: string; level: string; npsn: string | null; headmaster: string | null; student_count: number; teacher_count: number };
type Scholarship = { id: string; name: string; provider: string | null; period_year: number; quota: number | null; status: string; awarded_count: number };
type Application = { id: string; applicant_name: string; status: string; rejection_reason: string | null; scholarship_name: string; school_name: string | null; nik: string | null };

const TABS = ["health", "education"] as const;
type Tab = (typeof TABS)[number];

const PROGRAM_LABEL: Record<string, string> = {
  posyandu: "Posyandu", imunisasi: "Imunisasi", kesehatan_ibu: "Kesehatan Ibu",
  kesehatan_lansia: "Kesehatan Lansia", sanitasi: "Sanitasi", lainnya: "Lainnya",
};
const LEVEL_LABEL: Record<string, string> = { paud: "PAUD", tk: "TK", sd: "SD", smp: "SMP", sma: "SMA", smk: "SMK", lainnya: "Lainnya" };
const APP_STATUS: Record<string, "success" | "warning" | "destructive" | "default" | "muted"> = {
  candidate: "warning", verified: "default", accepted: "default", awarded: "success", rejected: "destructive",
};

export function ServicesClient() {
  const { toast } = useToast();
  const [tab, setTab] = React.useState<Tab>("health");
  const [programs, setPrograms] = React.useState<HealthProgram[] | null>(null);
  const [visits, setVisits] = React.useState<HealthVisit[]>([]);
  const [schools, setSchools] = React.useState<School[] | null>(null);
  const [scholarships, setScholarships] = React.useState<Scholarship[]>([]);
  const [applications, setApplications] = React.useState<Application[]>([]);
  const [programOpen, setProgramOpen] = React.useState(false);
  const [visitOpen, setVisitOpen] = React.useState<HealthProgram | null>(null);
  const [schoolOpen, setSchoolOpen] = React.useState(false);
  const [scholarshipOpen, setScholarshipOpen] = React.useState(false);
  const [insight, setInsight] = React.useState<{ candidates: { resident_id: string; name: string; score: string; factors: Record<string, unknown> }[]; disclaimer: string } | null>(null);
  const [insightFor, setInsightFor] = React.useState<Scholarship | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [programForm, setProgramForm] = React.useState({ name: "", programType: "posyandu", scheduleText: "", locationText: "" });
  const [visitForm, setVisitForm] = React.useState({ visitDate: new Date().toISOString().slice(0, 10), participantCount: "1", notes: "" });
  const [schoolForm, setSchoolForm] = React.useState({ name: "", level: "sd", headmaster: "", studentCount: "", teacherCount: "" });
  const [scholarshipForm, setScholarshipForm] = React.useState({ name: "", provider: "", quota: "" });

  const load = React.useCallback(async () => {
    const res = await fetch(`/api/services?view=${tab}`);
    const json = await res.json();
    if (!json.ok) { toast(json.error ?? "Gagal memuat", "error"); return; }
    if (tab === "health") { setPrograms(json.data.programs); setVisits(json.data.visits); }
    else { setSchools(json.data.schools); setScholarships(json.data.scholarships); setApplications(json.data.applications); }
  }, [tab, toast]);
  React.useEffect(() => { load(); }, [load]);

  async function post(body: Record<string, unknown>, okMsg: string, close: () => void) {
    setSaving(true);
    const res = await fetch("/api/services", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast(okMsg, "success"); close(); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function review(applicationId: string, action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/services", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId, action, ...extra }) });
    const json = await res.json();
    if (json.ok) { toast("Status diperbarui", "success"); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function loadInsight(s: Scholarship) {
    const res = await fetch(`/api/services/scholarship-insight?scholarshipId=${s.id}`);
    const json = await res.json();
    if (json.ok) { setInsight(json.data); setInsightFor(s); }
    else toast(json.error ?? "Gagal memuat", "error");
  }

  async function addCandidate(c: { resident_id: string; name: string }) {
    if (!insightFor) return;
    await post({ mode: "scholarship_application", scholarshipId: insightFor.id, residentId: c.resident_id, applicantName: c.name }, "Kandidat ditambahkan", () => setInsight(null));
  }

  return (
    <div>
      <PageHeader
        title="Kesehatan & Pendidikan"
        description="Program kesehatan masyarakat (privacy-by-design), sekolah, dan beasiswa"
      />

      <div className="mb-4 flex gap-1 rounded-xl border p-1 w-fit">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={"rounded-lg px-4 py-1.5 text-sm font-medium transition-colors " + (tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t === "health" ? "Kesehatan" : "Pendidikan"}
          </button>
        ))}
      </div>

      {tab === "health" && (
        <>
          <div className="flex justify-end mb-3">
            <Button onClick={() => setProgramOpen(true)}><Plus className="h-4 w-4" /> Program Kesehatan</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {programs === null ? (
              <p className="py-6 text-center text-sm text-muted-foreground md:col-span-2">Memuat...</p>
            ) : programs.length === 0 ? (
              <EmptyState icon={HeartPulse} title="Belum ada program" description="Buat program posyandu atau kesehatan pertama." />
            ) : programs.map((p) => (
              <Card key={p.id}>
                <CardHeader className="flex-row items-start justify-between gap-2 pb-2">
                  <div>
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{PROGRAM_LABEL[p.program_type] ?? p.program_type}{p.schedule_text ? ` · ${p.schedule_text}` : ""}</p>
                  </div>
                  <Badge variant={p.is_active ? "success" : "muted"}>{p.is_active ? "Aktif" : "Nonaktif"}</Badge>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">{p.visit_count} kegiatan · {p.total_participants} total peserta</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => { setVisitOpen(p); setVisitForm({ visitDate: new Date().toISOString().slice(0, 10), participantCount: "1", notes: "" }); }}>
                    Catat Kegiatan
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          {visits.length > 0 && (
            <Card className="mt-4">
              <CardHeader><CardTitle>Kegiatan Terakhir</CardTitle></CardHeader>
              <CardContent className="pt-2">
                <DataTable
                  rows={visits}
                  columns={[
                    { key: "program", header: "Program", render: (v) => v.program_name },
                    { key: "date", header: "Tanggal", render: (v) => new Date(v.visit_date).toLocaleDateString("id-ID") },
                    { key: "count", header: "Peserta", render: (v) => String(v.participant_count) },
                    { key: "notes", header: "Catatan", render: (v) => v.notes ?? "-" },
                  ]}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {tab === "education" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 mb-4">
            <StatCard label="Sekolah Terdaftar" value={String(schools?.length ?? 0)} icon={<GraduationCap className="h-5 w-5" />} />
            <StatCard label="Program Beasiswa" value={String(scholarships.length)} icon={<Award className="h-5 w-5" />} />
          </div>
          <div className="flex justify-end gap-2 mb-3">
            <Button variant="outline" onClick={() => setSchoolOpen(true)}><Plus className="h-4 w-4" /> Sekolah</Button>
            <Button onClick={() => setScholarshipOpen(true)}><Plus className="h-4 w-4" /> Beasiswa</Button>
          </div>

          <Card>
            <CardHeader><CardTitle>Sekolah</CardTitle></CardHeader>
            <CardContent className="pt-2">
              {schools === null ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
              ) : schools.length === 0 ? (
                <EmptyState icon={GraduationCap} title="Belum ada sekolah" />
              ) : (
                <DataTable
                  rows={schools}
                  columns={[
                    { key: "name", header: "Sekolah", render: (s) => (<div><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{LEVEL_LABEL[s.level] ?? s.level}{s.npsn ? ` · NPSN ${s.npsn}` : ""}</p></div>) },
                    { key: "head", header: "Kepala", render: (s) => s.headmaster ?? "-" },
                    { key: "students", header: "Siswa", render: (s) => String(s.student_count) },
                    { key: "teachers", header: "Guru", render: (s) => String(s.teacher_count) },
                  ]}
                />
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader><CardTitle>Program Beasiswa</CardTitle></CardHeader>
            <CardContent className="pt-2">
              {scholarships.length === 0 ? (
                <EmptyState icon={Award} title="Belum ada program beasiswa" />
              ) : (
                <div className="space-y-2">
                  {scholarships.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.provider ?? "-"} · {s.period_year} · diberikan {s.awarded_count}{s.quota ? `/${s.quota}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={s.status === "active" ? "success" : "muted"}>{s.status}</Badge>
                        <Button size="sm" variant="outline" onClick={() => loadInsight(s)}><Sparkles className="h-4 w-4" /> Kandidat</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {applications.length > 0 && (
            <Card className="mt-4">
              <CardHeader><CardTitle>Pendaftar Beasiswa</CardTitle></CardHeader>
              <CardContent className="pt-2">
                <DataTable
                  rows={applications}
                  columns={[
                    { key: "name", header: "Pendaftar", render: (a) => (<div><p className="font-medium">{a.applicant_name}</p><p className="text-xs text-muted-foreground">{a.scholarship_name}{a.school_name ? ` · ${a.school_name}` : ""}</p></div>) },
                    { key: "status", header: "Status", render: (a) => <Badge variant={APP_STATUS[a.status] ?? "muted"}>{a.status}</Badge> },
                    { key: "actions", header: "", className: "text-right", render: (a) => (
                      <div className="flex justify-end gap-1">
                        {a.status === "candidate" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => review(a.id, "verify")}>Verifikasi</Button>
                            <Button size="sm" variant="ghost" onClick={() => review(a.id, "reject", { rejectionReason: "Tidak memenuhi kriteria" })} aria-label="Tolak"><XCircle className="h-4 w-4 text-destructive" /></Button>
                          </>
                        )}
                        {a.status === "verified" && <Button size="sm" variant="outline" onClick={() => review(a.id, "accept")}>Terima</Button>}
                        {a.status === "accepted" && <Button size="sm" variant="secondary" onClick={() => review(a.id, "award")}><Award className="h-4 w-4" /> Berikan</Button>}
                      </div>
                    )},
                  ]}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Modal open={programOpen} onClose={() => setProgramOpen(false)} title="Program Kesehatan Baru">
        <form onSubmit={(e) => { e.preventDefault(); post({ mode: "health_program", ...programForm, scheduleText: programForm.scheduleText || null, locationText: programForm.locationText || null }, "Program dibuat", () => setProgramOpen(false)); }} className="space-y-4">
          <div><Label htmlFor="hp-name">Nama</Label><Input id="hp-name" required value={programForm.name} onChange={(e) => setProgramForm({ ...programForm, name: e.target.value })} placeholder="Posyandu Balita Dusun 1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="hp-type">Jenis</Label>
              <Select id="hp-type" value={programForm.programType} onChange={(e) => setProgramForm({ ...programForm, programType: e.target.value })}>
                {Object.entries(PROGRAM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div><Label htmlFor="hp-sched">Jadwal</Label><Input id="hp-sched" value={programForm.scheduleText} onChange={(e) => setProgramForm({ ...programForm, scheduleText: e.target.value })} placeholder="Tanggal 10 tiap bulan" /></div>
          </div>
          <div><Label htmlFor="hp-loc">Lokasi</Label><Input id="hp-loc" value={programForm.locationText} onChange={(e) => setProgramForm({ ...programForm, locationText: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setProgramOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!visitOpen} onClose={() => setVisitOpen(null)} title={`Catat Kegiatan: ${visitOpen?.name ?? ""}`}>
        <form onSubmit={(e) => { e.preventDefault(); if (visitOpen) post({ mode: "health_visit", programId: visitOpen.id, visitDate: visitForm.visitDate, participantCount: Number(visitForm.participantCount), notes: visitForm.notes || null }, "Kegiatan tercatat", () => setVisitOpen(null)); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="hv-date">Tanggal</Label><Input id="hv-date" type="date" required value={visitForm.visitDate} onChange={(e) => setVisitForm({ ...visitForm, visitDate: e.target.value })} /></div>
            <div><Label htmlFor="hv-count">Jumlah Peserta</Label><Input id="hv-count" type="number" min="1" required value={visitForm.participantCount} onChange={(e) => setVisitForm({ ...visitForm, participantCount: e.target.value })} /></div>
          </div>
          <div><Label htmlFor="hv-notes">Catatan umum (tanpa data medis individu)</Label><Textarea id="hv-notes" value={visitForm.notes} onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setVisitOpen(null)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Catat"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={schoolOpen} onClose={() => setSchoolOpen(false)} title="Sekolah Baru">
        <form onSubmit={(e) => { e.preventDefault(); post({ mode: "school", ...schoolForm, studentCount: schoolForm.studentCount ? Number(schoolForm.studentCount) : 0, teacherCount: schoolForm.teacherCount ? Number(schoolForm.teacherCount) : 0 }, "Sekolah ditambahkan", () => setSchoolOpen(false)); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="sc-name">Nama</Label><Input id="sc-name" required value={schoolForm.name} onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })} /></div>
            <div>
              <Label htmlFor="sc-level">Jenjang</Label>
              <Select id="sc-level" value={schoolForm.level} onChange={(e) => setSchoolForm({ ...schoolForm, level: e.target.value })}>
                {Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label htmlFor="sc-head">Kepala Sekolah</Label><Input id="sc-head" value={schoolForm.headmaster} onChange={(e) => setSchoolForm({ ...schoolForm, headmaster: e.target.value })} /></div>
            <div><Label htmlFor="sc-stu">Siswa</Label><Input id="sc-stu" type="number" min="0" value={schoolForm.studentCount} onChange={(e) => setSchoolForm({ ...schoolForm, studentCount: e.target.value })} /></div>
            <div><Label htmlFor="sc-tea">Guru</Label><Input id="sc-tea" type="number" min="0" value={schoolForm.teacherCount} onChange={(e) => setSchoolForm({ ...schoolForm, teacherCount: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setSchoolOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={scholarshipOpen} onClose={() => setScholarshipOpen(false)} title="Program Beasiswa Baru">
        <form onSubmit={(e) => { e.preventDefault(); post({ mode: "scholarship", name: scholarshipForm.name, provider: scholarshipForm.provider || null, quota: scholarshipForm.quota ? Number(scholarshipForm.quota) : null }, "Beasiswa dibuat", () => setScholarshipOpen(false)); }} className="space-y-4">
          <div><Label htmlFor="so-name">Nama</Label><Input id="so-name" required value={scholarshipForm.name} onChange={(e) => setScholarshipForm({ ...scholarshipForm, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="so-prov">Penyedia</Label><Input id="so-prov" value={scholarshipForm.provider} onChange={(e) => setScholarshipForm({ ...scholarshipForm, provider: e.target.value })} /></div>
            <div><Label htmlFor="so-quota">Kuota</Label><Input id="so-quota" type="number" min="1" value={scholarshipForm.quota} onChange={(e) => setScholarshipForm({ ...scholarshipForm, quota: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setScholarshipOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!insightFor} onClose={() => setInsightFor(null)} title={`Kandidat Beasiswa: ${insightFor?.name ?? ""}`} className="max-w-2xl">
        <div className="space-y-3">
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-yellow-800 dark:text-yellow-300">{insight?.disclaimer}</p>
          {(insight?.candidates ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Belum ada warga dengan indikator relevan tercatat.</p>
          ) : (
            insight!.candidates.map((c) => (
              <div key={c.resident_id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="text-sm">
                  <p className="font-medium">{c.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Faktor: {[
                      c.factors.out_of_school_risk === "true" && "risiko putus sekolah",
                      c.factors.no_income === "true" && "tanpa penghasilan",
                      c.factors.single_parent === "true" && "single parent",
                      Number(c.factors.school_age_children) > 0 && `${c.factors.school_age_children} anak usia sekolah`,
                    ].filter(Boolean).join(", ") || "-"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary">{Number(c.score)}</p>
                  <Button size="sm" variant="outline" onClick={() => addCandidate(c)}>Tambah</Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
