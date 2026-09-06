"use client";

import * as React from "react";
import { Plus, Siren, Recycle, TreePine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, StatCard } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type Report = { id: string; category: string; severity: string; status: string; description: string | null; reporter_name: string | null; is_anonymous: boolean; team_note: string | null; created_at: string };
type Resource = { id: string; resource_type: string; name: string; description: string | null; capacity: number | null; contact_phone: string | null };
type WastePoint = { id: string; point_type: string; name: string; capacity_kg: number | null; last_pickup_date: string | null };
type Schedule = { id: string; day_of_week: number; time_text: string; vehicle: string | null; crew: string | null; is_active: boolean; point_name: string | null };
type EnvAsset = { id: string; asset_type: string; name: string; description: string | null; planted_count: number | null; condition: string };

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const CAT_LABEL: Record<string, string> = { banjir: "Banjir", longsor: "Longsor", kebakaran: "Kebakaran", gempa: "Gempa", pohon_tumbang: "Pohon Tumbang", kecelakaan: "Kecelakaan", lainnya: "Lainnya" };
const SEV_VARIANT: Record<string, "success" | "warning" | "destructive" | "default"> = { rendah: "success", sedang: "warning", tinggi: "destructive", darurat: "destructive" };
const RES_LABEL: Record<string, string> = { jalur_evakuasi: "Jalur Evakuasi", pengungsian: "Tempat Pengungsian", posko: "Posko", peralatan: "Peralatan" };
const WASTE_LABEL: Record<string, string> = { tps: "TPS", bank_sampah: "Bank Sampah", tpa: "TPA", titik_wilayah: "Titik Wilayah" };
const ENV_LABEL: Record<string, string> = { penghijauan: "Penghijauan", sumber_air: "Sumber Air", titik_banjir: "Titik Banjir", titik_sampah_liar: "Sampah Liar", kualitas_udara: "Kualitas Udara" };
const COND_VARIANT: Record<string, "success" | "warning" | "destructive"> = { baik: "success", perhatian: "warning", kritis: "destructive" };

export function EmergencyClient() {
  const { toast } = useToast();
  const [tab, setTab] = React.useState<"emergency" | "environment">("emergency");
  const [reports, setReports] = React.useState<Report[] | null>(null);
  const [resources, setResources] = React.useState<Resource[]>([]);
  const [wastePoints, setWastePoints] = React.useState<WastePoint[] | null>(null);
  const [schedules, setSchedules] = React.useState<Schedule[]>([]);
  const [envAssets, setEnvAssets] = React.useState<EnvAsset[]>([]);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [resourceOpen, setResourceOpen] = React.useState(false);
  const [wasteOpen, setWasteOpen] = React.useState(false);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [envOpen, setEnvOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [reportForm, setReportForm] = React.useState({ category: "banjir", severity: "sedang", description: "", reporterName: "", isAnonymous: false });
  const [resourceForm, setResourceForm] = React.useState({ resourceType: "pengungsian", name: "", capacity: "", contactPhone: "" });
  const [wasteForm, setWasteForm] = React.useState({ pointType: "tps", name: "", capacityKg: "" });
  const [scheduleForm, setScheduleForm] = React.useState({ wastePointId: "", dayOfWeek: "1", timeText: "07:00", vehicle: "", crew: "" });
  const [envForm, setEnvForm] = React.useState({ assetType: "penghijauan", name: "", plantedCount: "", condition: "baik" });

  const load = React.useCallback(async () => {
    const view = tab === "emergency" ? "emergency" : "environment";
    const res = await fetch(`/api/emergency?view=${view}`);
    const json = await res.json();
    if (!json.ok) { toast(json.error ?? "Gagal memuat", "error"); return; }
    if (tab === "emergency") { setReports(json.data.reports); setResources(json.data.resources); }
    else { setWastePoints(json.data.wastePoints); setSchedules(json.data.schedules); setEnvAssets(json.data.envAssets); }
  }, [tab, toast]);
  React.useEffect(() => { load(); }, [load]);

  async function post(body: Record<string, unknown>, okMsg: string, close: () => void) {
    setSaving(true);
    const res = await fetch("/api/emergency", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast(okMsg, "success"); close(); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function act(reportId: string, action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/emergency", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId, action, ...extra }) });
    const json = await res.json();
    if (json.ok) { toast("Status diperbarui", "success"); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  const activeReports = (reports ?? []).filter((r) => !["resolved", "closed"].includes(r.status));

  return (
    <div>
      <PageHeader
        title="Kebencanaan & Lingkungan"
        description="Emergency center, jalur evakuasi, pengelolaan sampah, dan lingkungan desa"
        actions={
          tab === "emergency"
            ? <Button onClick={() => setReportOpen(true)}><Siren className="h-4 w-4" /> Laporan Darurat</Button>
            : <div className="flex gap-2">
                <Button variant="outline" onClick={() => setWasteOpen(true)}><Plus className="h-4 w-4" /> Titik Sampah</Button>
                <Button variant="outline" onClick={() => setScheduleOpen(true)}><Plus className="h-4 w-4" /> Jadwal</Button>
                <Button onClick={() => setEnvOpen(true)}><Plus className="h-4 w-4" /> Lingkungan</Button>
              </div>
        }
      />

      <div className="mb-4 flex gap-1 rounded-xl border p-1 w-fit">
        {(["emergency", "environment"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={"rounded-lg px-4 py-1.5 text-sm font-medium transition-colors " + (tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t === "emergency" ? "Emergency Center" : "Lingkungan & Sampah"}
          </button>
        ))}
      </div>

      {tab === "emergency" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Laporan Aktif" value={String(activeReports.length)} icon={<Siren className="h-5 w-5" />} />
            <StatCard label="Total Laporan" value={String(reports?.length ?? 0)} icon={<ShieldCheck className="h-5 w-5" />} />
            <StatCard label="Sumber Daya" value={String(resources.length)} icon={<ShieldCheck className="h-5 w-5" />} />
          </div>

          <Card className="mt-4">
            <CardHeader><CardTitle>Laporan Darurat</CardTitle></CardHeader>
            <CardContent className="pt-2">
              {reports === null ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
              ) : reports.length === 0 ? (
                <EmptyState icon={Siren} title="Tidak ada laporan" description="Semua aman." />
              ) : (
                <div className="space-y-2">
                  {reports.map((r) => (
                    <div key={r.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{CAT_LABEL[r.category] ?? r.category}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {r.is_anonymous ? "Anonim" : r.reporter_name ?? "-"} · {new Date(r.created_at).toLocaleString("id-ID")}
                            </span>
                          </p>
                          {r.description && <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>}
                        </div>
                        <div className="flex gap-1">
                          <Badge variant={SEV_VARIANT[r.severity] ?? "default"}>{r.severity}</Badge>
                          <Badge variant="muted">{r.status.replace(/_/g, " ")}</Badge>
                        </div>
                      </div>
                      {r.team_note && <p className="mt-1 text-xs text-muted-foreground">Tim: {r.team_note}</p>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.status === "reported" && <Button size="sm" variant="outline" onClick={() => act(r.id, "verify")}>Verifikasi</Button>}
                        {(r.status === "reported" || r.status === "verified") && <Button size="sm" variant="outline" onClick={() => act(r.id, "assign_team", { teamNote: "Tim ditugaskan" })}>Tugaskan Tim</Button>}
                        {r.status === "team_assigned" && <Button size="sm" variant="outline" onClick={() => act(r.id, "evacuate")}>Evakuasi</Button>}
                        {(r.status === "team_assigned" || r.status === "evacuating") && <Button size="sm" variant="secondary" onClick={() => act(r.id, "resolve")}>Selesai</Button>}
                        {r.status === "resolved" && <Button size="sm" variant="ghost" onClick={() => act(r.id, "close")}>Tutup</Button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>Sumber Daya Darurat</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setResourceOpen(true)}><Plus className="h-4 w-4" /> Tambah</Button>
            </CardHeader>
            <CardContent className="pt-2">
              {resources.length === 0 ? (
                <EmptyState icon={ShieldCheck} title="Belum ada sumber daya" description="Daftarkan jalur evakuasi, pengungsian, atau posko." />
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {resources.map((r) => (
                    <div key={r.id} className="rounded-lg border p-3">
                      <p className="text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{RES_LABEL[r.resource_type] ?? r.resource_type}{r.capacity ? ` · kapasitas ${r.capacity}` : ""}{r.contact_phone ? ` · ${r.contact_phone}` : ""}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {tab === "environment" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Titik Sampah" value={String(wastePoints?.length ?? 0)} icon={<Recycle className="h-5 w-5" />} />
            <StatCard label="Jadwal Aktif" value={String(schedules.filter((s) => s.is_active).length)} icon={<Recycle className="h-5 w-5" />} />
            <StatCard label="Aset Lingkungan" value={String(envAssets.length)} icon={<TreePine className="h-5 w-5" />} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Titik Sampah & Jadwal</CardTitle></CardHeader>
              <CardContent className="pt-2 space-y-3">
                {wastePoints === null ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Memuat...</p>
                ) : wastePoints.length === 0 ? (
                  <EmptyState icon={Recycle} title="Belum ada titik sampah" />
                ) : (
                  wastePoints.map((w) => (
                    <div key={w.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{w.name}</p>
                        <Badge variant="muted">{WASTE_LABEL[w.point_type] ?? w.point_type}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {w.capacity_kg ? `Kapasitas ${w.capacity_kg} kg` : ""}
                        {w.last_pickup_date ? ` · diangkut ${new Date(w.last_pickup_date).toLocaleDateString("id-ID")}` : ""}
                      </p>
                      {schedules.filter((s) => s.point_name === w.name).map((s) => (
                        <p key={s.id} className="mt-1 text-xs">Jadwal: {DAYS[s.day_of_week]} {s.time_text}{s.crew ? ` · ${s.crew}` : ""}</p>
                      ))}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Aset Lingkungan</CardTitle></CardHeader>
              <CardContent className="pt-2">
                {envAssets.length === 0 ? (
                  <EmptyState icon={TreePine} title="Belum ada data lingkungan" />
                ) : (
                  <div className="space-y-2">
                    {envAssets.map((a) => (
                      <div key={a.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium">{a.name}</p>
                          <p className="text-xs text-muted-foreground">{ENV_LABEL[a.asset_type] ?? a.asset_type}{a.planted_count ? ` · ${a.planted_count} pohon` : ""}</p>
                        </div>
                        <Badge variant={COND_VARIANT[a.condition] ?? "muted"}>{a.condition}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Laporan Darurat">
        <form onSubmit={(e) => { e.preventDefault(); post({ mode: "emergency_report", category: reportForm.category, severity: reportForm.severity, description: reportForm.description || null, reporterName: reportForm.reporterName || null, isAnonymous: reportForm.isAnonymous, location: { type: "Point", coordinates: [110.328, -7.895] } }, "Laporan terkirim", () => setReportOpen(false)); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="er-cat">Kategori</Label>
              <Select id="er-cat" value={reportForm.category} onChange={(e) => setReportForm({ ...reportForm, category: e.target.value })}>
                {Object.entries(CAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="er-sev">Tingkat</Label>
              <Select id="er-sev" value={reportForm.severity} onChange={(e) => setReportForm({ ...reportForm, severity: e.target.value })}>
                <option value="rendah">Rendah</option><option value="sedang">Sedang</option>
                <option value="tinggi">Tinggi</option><option value="darurat">Darurat</option>
              </Select>
            </div>
          </div>
          <div><Label htmlFor="er-desc">Deskripsi</Label><Textarea id="er-desc" value={reportForm.description} onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })} /></div>
          {!reportForm.isAnonymous && (
            <div><Label htmlFor="er-name">Nama Pelapor</Label><Input id="er-name" value={reportForm.reporterName} onChange={(e) => setReportForm({ ...reportForm, reporterName: e.target.value })} /></div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reportForm.isAnonymous} onChange={(e) => setReportForm({ ...reportForm, isAnonymous: e.target.checked })} className="accent-primary" />
            Laporkan sebagai anonim
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setReportOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Mengirim..." : "Kirim"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={resourceOpen} onClose={() => setResourceOpen(false)} title="Sumber Daya Darurat">
        <form onSubmit={(e) => { e.preventDefault(); post({ mode: "resource", ...resourceForm, capacity: resourceForm.capacity ? Number(resourceForm.capacity) : null, contactPhone: resourceForm.contactPhone || null }, "Sumber daya ditambahkan", () => setResourceOpen(false)); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rs-type">Jenis</Label>
              <Select id="rs-type" value={resourceForm.resourceType} onChange={(e) => setResourceForm({ ...resourceForm, resourceType: e.target.value })}>
                {Object.entries(RES_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div><Label htmlFor="rs-name">Nama</Label><Input id="rs-name" required value={resourceForm.name} onChange={(e) => setResourceForm({ ...resourceForm, name: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="rs-cap">Kapasitas</Label><Input id="rs-cap" type="number" min="0" value={resourceForm.capacity} onChange={(e) => setResourceForm({ ...resourceForm, capacity: e.target.value })} /></div>
            <div><Label htmlFor="rs-phone">Kontak</Label><Input id="rs-phone" value={resourceForm.contactPhone} onChange={(e) => setResourceForm({ ...resourceForm, contactPhone: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setResourceOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={wasteOpen} onClose={() => setWasteOpen(false)} title="Titik Sampah Baru">
        <form onSubmit={(e) => { e.preventDefault(); post({ mode: "waste_point", ...wasteForm, capacityKg: wasteForm.capacityKg ? Number(wasteForm.capacityKg) : null }, "Titik sampah ditambahkan", () => setWasteOpen(false)); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="wp-type">Jenis</Label>
              <Select id="wp-type" value={wasteForm.pointType} onChange={(e) => setWasteForm({ ...wasteForm, pointType: e.target.value })}>
                {Object.entries(WASTE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div><Label htmlFor="wp-name">Nama</Label><Input id="wp-name" required value={wasteForm.name} onChange={(e) => setWasteForm({ ...wasteForm, name: e.target.value })} /></div>
          </div>
          <div><Label htmlFor="wp-cap">Kapasitas (kg)</Label><Input id="wp-cap" type="number" min="0" value={wasteForm.capacityKg} onChange={(e) => setWasteForm({ ...wasteForm, capacityKg: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setWasteOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={scheduleOpen} onClose={() => setScheduleOpen(false)} title="Jadwal Pengangkutan">
        <form onSubmit={(e) => { e.preventDefault(); post({ mode: "waste_schedule", wastePointId: scheduleForm.wastePointId || null, dayOfWeek: Number(scheduleForm.dayOfWeek), timeText: scheduleForm.timeText, vehicle: scheduleForm.vehicle || null, crew: scheduleForm.crew || null }, "Jadwal dibuat", () => setScheduleOpen(false)); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ws-day">Hari</Label>
              <Select id="ws-day" value={scheduleForm.dayOfWeek} onChange={(e) => setScheduleForm({ ...scheduleForm, dayOfWeek: e.target.value })}>
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </Select>
            </div>
            <div><Label htmlFor="ws-time">Waktu</Label><Input id="ws-time" required value={scheduleForm.timeText} onChange={(e) => setScheduleForm({ ...scheduleForm, timeText: e.target.value })} placeholder="07:00" /></div>
          </div>
          <div>
            <Label htmlFor="ws-point">Titik Sampah</Label>
            <Select id="ws-point" value={scheduleForm.wastePointId} onChange={(e) => setScheduleForm({ ...scheduleForm, wastePointId: e.target.value })}>
              <option value="">Umum (semua titik)</option>
              {(wastePoints ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="ws-veh">Kendaraan</Label><Input id="ws-veh" value={scheduleForm.vehicle} onChange={(e) => setScheduleForm({ ...scheduleForm, vehicle: e.target.value })} /></div>
            <div><Label htmlFor="ws-crew">Petugas</Label><Input id="ws-crew" value={scheduleForm.crew} onChange={(e) => setScheduleForm({ ...scheduleForm, crew: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setScheduleOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={envOpen} onClose={() => setEnvOpen(false)} title="Aset Lingkungan Baru">
        <form onSubmit={(e) => { e.preventDefault(); post({ mode: "env_asset", ...envForm, plantedCount: envForm.plantedCount ? Number(envForm.plantedCount) : null }, "Aset lingkungan ditambahkan", () => setEnvOpen(false)); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ea-type">Jenis</Label>
              <Select id="ea-type" value={envForm.assetType} onChange={(e) => setEnvForm({ ...envForm, assetType: e.target.value })}>
                {Object.entries(ENV_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div><Label htmlFor="ea-name">Nama</Label><Input id="ea-name" required value={envForm.name} onChange={(e) => setEnvForm({ ...envForm, name: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="ea-count">Jumlah Pohon</Label><Input id="ea-count" type="number" min="0" value={envForm.plantedCount} onChange={(e) => setEnvForm({ ...envForm, plantedCount: e.target.value })} /></div>
            <div>
              <Label htmlFor="ea-cond">Kondisi</Label>
              <Select id="ea-cond" value={envForm.condition} onChange={(e) => setEnvForm({ ...envForm, condition: e.target.value })}>
                <option value="baik">Baik</option><option value="perhatian">Perhatian</option><option value="kritis">Kritis</option>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEnvOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
