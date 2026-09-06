"use client";

import * as React from "react";
import { Plus, MapPin, AlertTriangle, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type GisObject = {
  id: string; object_type: string; name: string; description: string | null;
  geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown>;
  linked_asset_id: string | null;
};
type Incident = {
  id: string; incident_type: string; severity: string; status: string;
  location: { type: string; coordinates: [number, number] }; description: string | null;
  assigned_to: string | null; object_name: string | null; created_at: string;
};

const TYPE_LABEL: Record<string, string> = {
  jalan: "Jalan", fasilitas: "Fasilitas", rumah: "Rumah", lahan: "Lahan",
  air: "Sumber Air", batas: "Batas Wilayah", titik_rawan: "Titik Rawan", lainnya: "Lainnya",
};
const INCIDENT_LABEL: Record<string, string> = {
  banjir: "Banjir", longsor: "Longsor", kebakaran: "Kebakaran",
  pohon_tumbang: "Pohon Tumbang", jalan_rusak: "Jalan Rusak", lainnya: "Lainnya",
};
const SEVERITY_VARIANT: Record<string, "success" | "warning" | "destructive" | "default"> = {
  rendah: "success", sedang: "warning", tinggi: "destructive", darurat: "destructive",
};

export function GisClient() {
  const { toast } = useToast();
  const [objects, setObjects] = React.useState<GisObject[] | null>(null);
  const [incidents, setIncidents] = React.useState<Incident[] | null>(null);
  const [typeFilter, setTypeFilter] = React.useState("");
  const [objOpen, setObjOpen] = React.useState(false);
  const [incOpen, setIncOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [objForm, setObjForm] = React.useState({ objectType: "jalan", name: "", description: "", lng: "", lat: "", kondisi: "baik" });
  const [incForm, setIncForm] = React.useState({ incidentType: "banjir", severity: "sedang", lng: "", lat: "", description: "" });

  const load = React.useCallback(async () => {
    const url = typeFilter ? `/api/gis?type=${typeFilter}` : "/api/gis";
    const res = await fetch(url);
    const json = await res.json();
    if (json.ok) { setObjects(json.data.objects); setIncidents(json.data.incidents); }
    else toast(json.error ?? "Gagal memuat", "error");
  }, [typeFilter, toast]);
  React.useEffect(() => { load(); }, [load]);

  async function createObject(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const geometry = objForm.objectType === "jalan"
      ? { type: "LineString", coordinates: [[Number(objForm.lng), Number(objForm.lat)], [Number(objForm.lng) + 0.001, Number(objForm.lat) + 0.001]] }
      : { type: "Point", coordinates: [Number(objForm.lng), Number(objForm.lat)] };
    const res = await fetch("/api/gis", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "object", objectType: objForm.objectType, name: objForm.name, description: objForm.description || null, geometry, properties: { kondisi: objForm.kondisi } }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Objek peta ditambahkan", "success"); setObjOpen(false); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function createIncident(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/gis", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "incident", incidentType: incForm.incidentType, severity: incForm.severity, description: incForm.description || null, location: { type: "Point", coordinates: [Number(incForm.lng), Number(incForm.lat)] } }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Insiden dilaporkan", "success"); setIncOpen(false); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function act(incidentId: string, action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/gis", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ incidentId, action, ...extra }),
    });
    const json = await res.json();
    if (json.ok) { toast("Status insiden diperbarui", "success"); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  return (
    <div>
      <PageHeader
        title="Peta Desa & Digital Twin"
        description="Objek geospasial, insiden lapangan, dan entitas digital desa"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIncOpen(true)}><AlertTriangle className="h-4 w-4" /> Laporkan Insiden</Button>
            <Button onClick={() => setObjOpen(true)}><Plus className="h-4 w-4" /> Objek Baru</Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2"><Layers className="h-4 w-4" /> Objek Peta</CardTitle>
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-40">
              <option value="">Semua jenis</option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </CardHeader>
          <CardContent className="pt-2">
            {objects === null ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
            ) : objects.length === 0 ? (
              <EmptyState icon={MapPin} title="Belum ada objek" description="Tambahkan jalan, fasilitas, atau batas wilayah." />
            ) : (
              <ul className="space-y-2">
                {objects.map((o) => (
                  <li key={o.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{o.name}</p>
                      <p className="text-xs text-muted-foreground">{TYPE_LABEL[o.object_type] ?? o.object_type} · {o.geometry.type}
                        {o.properties?.kondisi ? ` · kondisi ${o.properties.kondisi}` : ""}</p>
                      {o.description && <p className="mt-1 text-xs text-muted-foreground">{o.description}</p>}
                    </div>
                    <Badge variant="muted">{TYPE_LABEL[o.object_type] ?? o.object_type}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Insiden Aktif</CardTitle></CardHeader>
          <CardContent className="pt-2">
            {incidents === null ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
            ) : incidents.length === 0 ? (
              <EmptyState icon={AlertTriangle} title="Tidak ada insiden" description="Semua aman. Insiden dari sensor/laporan muncul di sini." />
            ) : (
              <ul className="space-y-2">
                {incidents.map((i) => (
                  <li key={i.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{INCIDENT_LABEL[i.incident_type] ?? i.incident_type}
                          {i.object_name ? ` · ${i.object_name}` : ""}</p>
                        <p className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleString("id-ID")}</p>
                      </div>
                      <Badge variant={SEVERITY_VARIANT[i.severity] ?? "default"}>{i.severity}</Badge>
                    </div>
                    {i.description && <p className="mt-1 text-xs text-muted-foreground">{i.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <Badge variant="muted">{i.status.replace(/_/g, " ")}</Badge>
                      {i.status === "reported" && <Button size="sm" variant="outline" onClick={() => act(i.id, "verify")}>Verifikasi</Button>}
                      {(i.status === "reported" || i.status === "verified") && <Button size="sm" variant="outline" onClick={() => act(i.id, "assign", { assignedTo: null })}>Tugaskan</Button>}
                      {i.status === "assigned" && <Button size="sm" variant="outline" onClick={() => act(i.id, "respond")}>Tanggapi</Button>}
                      {(i.status === "assigned" || i.status === "responding") && <Button size="sm" variant="secondary" onClick={() => act(i.id, "resolve")}>Selesai</Button>}
                      {i.status === "resolved" && <Button size="sm" variant="ghost" onClick={() => act(i.id, "post_report", { postIncidentNote: "Laporan pasca-insiden dibuat" })}>Post Report</Button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal open={objOpen} onClose={() => setObjOpen(false)} title="Objek Peta Baru">
        <form onSubmit={createObject} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="go-type">Jenis</Label>
              <Select id="go-type" value={objForm.objectType} onChange={(e) => setObjForm({ ...objForm, objectType: e.target.value })}>
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="go-kondisi">Kondisi</Label>
              <Select id="go-kondisi" value={objForm.kondisi} onChange={(e) => setObjForm({ ...objForm, kondisi: e.target.value })}>
                <option value="baik">Baik</option><option value="perlu_perbaikan">Perlu perbaikan</option><option value="rusak">Rusak</option>
              </Select>
            </div>
          </div>
          <div><Label htmlFor="go-name">Nama</Label><Input id="go-name" required value={objForm.name} onChange={(e) => setObjForm({ ...objForm, name: e.target.value })} placeholder="Jalan Mawar" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="go-lng">Longitude</Label><Input id="go-lng" type="number" step="any" required value={objForm.lng} onChange={(e) => setObjForm({ ...objForm, lng: e.target.value })} placeholder="110.328" /></div>
            <div><Label htmlFor="go-lat">Latitude</Label><Input id="go-lat" type="number" step="any" required value={objForm.lat} onChange={(e) => setObjForm({ ...objForm, lat: e.target.value })} placeholder="-7.895" /></div>
          </div>
          <div><Label htmlFor="go-desc">Deskripsi</Label><Textarea id="go-desc" value={objForm.description} onChange={(e) => setObjForm({ ...objForm, description: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setObjOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={incOpen} onClose={() => setIncOpen(false)} title="Laporkan Insiden">
        <form onSubmit={createIncident} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="gi-type">Jenis</Label>
              <Select id="gi-type" value={incForm.incidentType} onChange={(e) => setIncForm({ ...incForm, incidentType: e.target.value })}>
                {Object.entries(INCIDENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="gi-sev">Tingkat</Label>
              <Select id="gi-sev" value={incForm.severity} onChange={(e) => setIncForm({ ...incForm, severity: e.target.value })}>
                <option value="rendah">Rendah</option><option value="sedang">Sedang</option>
                <option value="tinggi">Tinggi</option><option value="darurat">Darurat</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="gi-lng">Longitude</Label><Input id="gi-lng" type="number" step="any" required value={incForm.lng} onChange={(e) => setIncForm({ ...incForm, lng: e.target.value })} /></div>
            <div><Label htmlFor="gi-lat">Latitude</Label><Input id="gi-lat" type="number" step="any" required value={incForm.lat} onChange={(e) => setIncForm({ ...incForm, lat: e.target.value })} /></div>
          </div>
          <div><Label htmlFor="gi-desc">Deskripsi</Label><Textarea id="gi-desc" value={incForm.description} onChange={(e) => setIncForm({ ...incForm, description: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIncOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Mengirim..." : "Laporkan"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
