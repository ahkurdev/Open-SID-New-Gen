"use client";

import * as React from "react";
import { Plus, Pencil, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { OrgChart } from "./org-chart";

export type Official = {
  id: string; user_id: string | null; name: string; type: string;
  position_title: string; organization: string | null; region_id: string | null;
  region_name: string | null; nip: string | null; phone: string | null;
  sort_order: number; is_active: boolean;
  terms: { positionTitle: string; termStart: string; termEnd: string | null; notes: string | null }[];
};
type Region = { id: string; level: string; code: string; name: string };

const TYPE_LABEL: Record<string, string> = {
  perangkat: "Perangkat Desa", bpd: "BPD", lembaga: "Lembaga", wilayah: "Kepala Wilayah",
};

const emptyForm = {
  name: "", type: "perangkat", positionTitle: "", organization: "",
  regionId: "", nip: "", phone: "", termStart: new Date().toISOString().slice(0, 10), termEnd: "",
};

export function VillageProfileClient() {
  const { toast } = useToast();
  const [tab, setTab] = React.useState<"profil" | "struktur" | "orgchart">("profil");
  const [village, setVillage] = React.useState<Record<string, unknown> | null>(null);
  const [officials, setOfficials] = React.useState<Official[] | null>(null);
  const [regions, setRegions] = React.useState<Region[]>([]);
  const [form, setForm] = React.useState({ ...emptyForm });
  const [editTarget, setEditTarget] = React.useState<Official | null>(null);
  const [editForm, setEditForm] = React.useState({ name: "", positionTitle: "", phone: "", organization: "" });
  const [termForm, setTermForm] = React.useState<{ official: Official; positionTitle: string; termStart: string; termEnd: string } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [profileForm, setProfileForm] = React.useState({ name: "", address: "", phone: "", email: "", postalCode: "", vision: "", mission: "", history: "", areaKm2: "" });

  const load = React.useCallback(async () => {
    const [p, o] = await Promise.all([fetch("/api/village-profile"), fetch("/api/officials")]);
    const pj = await p.json();
    const oj = await o.json();
    if (pj.ok && pj.data.village) {
      setVillage(pj.data.village);
      setProfileForm({
        name: pj.data.village.name ?? "", address: pj.data.village.address ?? "",
        phone: pj.data.village.phone ?? "", email: pj.data.village.email ?? "",
        postalCode: pj.data.village.postal_code ?? "", vision: pj.data.village.vision ?? "",
        mission: pj.data.village.mission ?? "", history: pj.data.village.history ?? "",
        areaKm2: pj.data.village.area_km2 != null ? String(pj.data.village.area_km2) : "",
      });
    }
    if (oj.ok) { setOfficials(oj.data.officials); setRegions(oj.data.regions); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/village-profile", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: profileForm.name || undefined, address: profileForm.address || null,
        phone: profileForm.phone || null, email: profileForm.email || null,
        postalCode: profileForm.postalCode || null, vision: profileForm.vision || null,
        mission: profileForm.mission || null, history: profileForm.history || null,
        areaKm2: profileForm.areaKm2 ? Number(profileForm.areaKm2) : null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Profil desa disimpan", "success"); load(); }
    else toast(json.error ?? "Gagal menyimpan", "error");
  }

  async function createOfficial(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/officials", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, type: form.type, positionTitle: form.positionTitle,
        organization: form.organization || null, regionId: form.regionId || null,
        nip: form.nip || null, phone: form.phone || null,
        termStart: form.termStart, termEnd: form.termEnd || null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Pejabat ditambahkan", "success"); setForm({ ...emptyForm }); load(); }
    else toast(json.error ?? "Gagal menambah", "error");
  }

  async function saveEdit() {
    if (!editTarget) return;
    setSaving(true);
    const res = await fetch("/api/officials", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editTarget.id, name: editForm.name, positionTitle: editForm.positionTitle,
        phone: editForm.phone || null, organization: editForm.organization || null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Data diperbarui", "success"); setEditTarget(null); load(); }
    else toast(json.error ?? "Gagal memperbarui", "error");
  }

  async function saveNewTerm() {
    if (!termForm) return;
    setSaving(true);
    const res = await fetch("/api/officials", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: termForm.official.id,
        newTerm: {
          positionTitle: termForm.positionTitle,
          termStart: termForm.termStart,
          termEnd: termForm.termEnd || null,
        },
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Masa jabatan baru tercatat, jabatan lama diarsipkan", "success"); setTermForm(null); load(); }
    else toast(json.error ?? "Gagal menyimpan", "error");
  }

  const tabs = [["profil", "Profil Desa"], ["struktur", "Perangkat & Lembaga"], ["orgchart", "Bagan Organisasi"]] as const;

  return (
    <div>
      <PageHeader
        title="Profil & Struktur Pemerintahan"
        description="Identitas desa, visi misi, perangkat, dan sejarah jabatan"
        actions={tab === "struktur" ? (
          <Button onClick={() => { setForm({ ...emptyForm }); document.getElementById("add-official")?.scrollIntoView({ behavior: "smooth" }); }}>
            <Plus className="h-4 w-4" /> Tambah Pejabat
          </Button>
        ) : undefined}
      />

      <div className="mb-4 flex gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={"rounded-md px-3 py-1.5 text-sm " + (tab === key ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "profil" && (
        <Card>
          <CardHeader><CardTitle>Identitas Desa</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="grid gap-4 md:grid-cols-2">
              <div><Label htmlFor="v-name">Nama Desa</Label><Input id="v-name" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} /></div>
              <div><Label htmlFor="v-code">Kode Wilayah</Label><Input id="v-code" value={String(village?.code ?? "-")} disabled /></div>
              <div className="md:col-span-2"><Label htmlFor="v-addr">Alamat Kantor</Label><Input id="v-addr" value={profileForm.address} onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })} /></div>
              <div><Label htmlFor="v-phone">Telepon</Label><Input id="v-phone" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} /></div>
              <div><Label htmlFor="v-email">Email</Label><Input id="v-email" type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} /></div>
              <div><Label htmlFor="v-pos">Kode Pos</Label><Input id="v-pos" value={profileForm.postalCode} onChange={(e) => setProfileForm({ ...profileForm, postalCode: e.target.value })} /></div>
              <div><Label htmlFor="v-area">Luas (km2)</Label><Input id="v-area" type="number" step="0.01" min="0" value={profileForm.areaKm2} onChange={(e) => setProfileForm({ ...profileForm, areaKm2: e.target.value })} /></div>
              <div className="md:col-span-2"><Label htmlFor="v-vision">Visi</Label><Textarea id="v-vision" value={profileForm.vision} onChange={(e) => setProfileForm({ ...profileForm, vision: e.target.value })} /></div>
              <div className="md:col-span-2"><Label htmlFor="v-mission">Misi</Label><Textarea id="v-mission" value={profileForm.mission} onChange={(e) => setProfileForm({ ...profileForm, mission: e.target.value })} /></div>
              <div className="md:col-span-2"><Label htmlFor="v-hist">Sejarah Desa</Label><Textarea id="v-hist" rows={5} value={profileForm.history} onChange={(e) => setProfileForm({ ...profileForm, history: e.target.value })} /></div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan Profil"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {tab === "struktur" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Daftar Pejabat</CardTitle></CardHeader>
            <CardContent>
              {officials === null ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
              ) : officials.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data pejabat. Tambahkan lewat formulir di bawah.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {officials.map((o) => (
                    <div key={o.id} className={"rounded-xl border p-4 " + (o.is_active ? "" : "opacity-50")}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{o.name}</p>
                          <p className="text-sm text-primary">{o.position_title}</p>
                          {o.organization && <p className="text-xs text-muted-foreground">{o.organization}</p>}
                          {o.region_name && <p className="text-xs text-muted-foreground">Wilayah: {o.region_name}</p>}
                        </div>
                        <Badge variant={o.type === "perangkat" ? "default" : "muted"}>{TYPE_LABEL[o.type] ?? o.type}</Badge>
                      </div>
                      {o.terms.length > 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Jabatan saat ini: {o.terms[0].positionTitle} ({o.terms[0].termStart} s.d. {o.terms[0].termEnd ?? "sekarang"})
                          {o.terms.length > 1 && ` · ${o.terms.length - 1} jabatan sebelumnya`}
                        </p>
                      )}
                      <div className="mt-3 flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setEditTarget(o); setEditForm({ name: o.name, positionTitle: o.position_title, phone: o.phone ?? "", organization: o.organization ?? "" }); }}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setTermForm({ official: o, positionTitle: o.position_title, termStart: new Date().toISOString().slice(0, 10), termEnd: "" })}>
                          <History className="h-3.5 w-3.5" /> Jabatan Baru
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card id="add-official">
            <CardHeader><CardTitle>Tambah Pejabat</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createOfficial} className="grid gap-4 md:grid-cols-2">
                <div><Label htmlFor="o-name">Nama</Label><Input id="o-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div>
                  <Label htmlFor="o-type">Kategori</Label>
                  <Select id="o-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <option value="perangkat">Perangkat Desa</option>
                    <option value="bpd">BPD</option>
                    <option value="lembaga">Lembaga</option>
                    <option value="wilayah">Kepala Wilayah (Dusun/RW/RT)</option>
                  </Select>
                </div>
                <div><Label htmlFor="o-pos">Jabatan</Label><Input id="o-pos" required value={form.positionTitle} onChange={(e) => setForm({ ...form, positionTitle: e.target.value })} placeholder="Sekretaris Desa" /></div>
                <div><Label htmlFor="o-org">Organisasi / Lembaga</Label><Input id="o-org" value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} placeholder="PKK, Karang Taruna" /></div>
                {form.type === "wilayah" && regions.length > 0 && (
                  <div>
                    <Label htmlFor="o-region">Wilayah</Label>
                    <Select id="o-region" value={form.regionId} onChange={(e) => setForm({ ...form, regionId: e.target.value })}>
                      <option value="">Pilih wilayah</option>
                      {regions.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.level})</option>)}
                    </Select>
                  </div>
                )}
                <div><Label htmlFor="o-nip">NIP (opsional)</Label><Input id="o-nip" value={form.nip} onChange={(e) => setForm({ ...form, nip: e.target.value })} /></div>
                <div><Label htmlFor="o-phone">Telepon</Label><Input id="o-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label htmlFor="o-start">Mulai Jabatan</Label><Input id="o-start" type="date" required value={form.termStart} onChange={(e) => setForm({ ...form, termStart: e.target.value })} /></div>
                <div><Label htmlFor="o-end">Akhir Jabatan (opsional)</Label><Input id="o-end" type="date" value={form.termEnd} onChange={(e) => setForm({ ...form, termEnd: e.target.value })} /></div>
                <div className="md:col-span-2 flex justify-end">
                  <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "orgchart" && <OrgChart officials={officials ?? []} />}

      <Modal open={Boolean(editTarget)} onClose={() => setEditTarget(null)} title={`Edit: ${editTarget?.name ?? ""}`}>
        <div className="space-y-4">
          <div><Label htmlFor="e-name">Nama</Label><Input id="e-name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
          <div><Label htmlFor="e-pos">Jabatan</Label><Input id="e-pos" value={editForm.positionTitle} onChange={(e) => setEditForm({ ...editForm, positionTitle: e.target.value })} /></div>
          <div><Label htmlFor="e-phone">Telepon</Label><Input id="e-phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
          <div><Label htmlFor="e-org">Organisasi</Label><Input id="e-org" value={editForm.organization} onChange={(e) => setEditForm({ ...editForm, organization: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditTarget(null)}>Batal</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(termForm)} onClose={() => setTermForm(null)} title={`Jabatan Baru: ${termForm?.official.name ?? ""}`}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Jabatan lama akan otomatis diarsipkan dengan tanggal berakhir kemarin. Riwayat tetap tersimpan.</p>
          <div><Label htmlFor="t-pos">Jabatan Baru</Label><Input id="t-pos" value={termForm?.positionTitle ?? ""} onChange={(e) => setTermForm(termForm ? { ...termForm, positionTitle: e.target.value } : null)} /></div>
          <div><Label htmlFor="t-start">Mulai</Label><Input id="t-start" type="date" value={termForm?.termStart ?? ""} onChange={(e) => setTermForm(termForm ? { ...termForm, termStart: e.target.value } : null)} /></div>
          <div><Label htmlFor="t-end">Akhir (opsional)</Label><Input id="t-end" type="date" value={termForm?.termEnd ?? ""} onChange={(e) => setTermForm(termForm ? { ...termForm, termEnd: e.target.value } : null)} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTermForm(null)}>Batal</Button>
            <Button onClick={saveNewTerm} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Jabatan Baru"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
