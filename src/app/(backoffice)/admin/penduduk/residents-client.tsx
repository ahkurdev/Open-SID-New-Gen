"use client";

import * as React from "react";
import { Plus, Search, Users, AlertTriangle, FileDown, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, StatCard } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Resident = {
  id: string; nik: string | null; name: string; gender: string;
  birth_place: string | null; birth_date: string | null; family_status: string | null;
  marital_status: string | null; education: string | null; occupation: string | null;
  status: string; rt: string | null; rw: string | null; phone: string | null;
  family_id: string | null; kk_number: string | null; dusun_name: string | null;
};
type Family = {
  id: string; kk_number: string | null; address: string | null; rt: string | null;
  rw: string | null; dusun_name: string | null; head_name: string | null; member_count: number;
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  tetap: "success", pendatang: "warning", tidak_tetap: "muted", pindah: "muted", meninggal: "destructive",
};

const emptyResident = {
  nik: "", name: "", gender: "L", birthPlace: "", birthDate: "", familyId: "",
  familyStatus: "", maritalStatus: "", education: "", occupation: "", religion: "",
  address: "", rt: "", rw: "", phone: "", status: "tetap",
};

export function ResidentsClient() {
  const { toast } = useToast();
  const [tab, setTab] = React.useState<"penduduk" | "keluarga">("penduduk");
  const [rows, setRows] = React.useState<Resident[] | null>(null);
  const [families, setFamilies] = React.useState<Family[] | null>(null);
  const [total, setTotal] = React.useState(0);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [limit] = React.useState(25);
  const [addOpen, setAddOpen] = React.useState(false);
  const [familyOpen, setFamilyOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<{ resident: Resident; timeline: { event_type: string; event_date: string; description: string | null }[]; duplicates: unknown[] } | null>(null);
  const [form, setForm] = React.useState({ ...emptyResident });
  const [familyForm, setFamilyForm] = React.useState({ kkNumber: "", address: "", rt: "", rw: "" });
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (query) params.set("q", query);
    if (statusFilter) params.set("status", statusFilter);
    const [r, f] = await Promise.all([
      fetch(`/api/residents?${params}`),
      fetch(`/api/families?page=1&limit=50`),
    ]);
    const rj = await r.json();
    const fj = await f.json();
    if (rj.ok) { setRows(rj.data.residents); setTotal(rj.data.total); } else { setRows([]); toast(rj.error ?? "Gagal memuat", "error"); }
    if (fj.ok) setFamilies(fj.data.families);
  }, [page, limit, query, statusFilter, toast]);

  React.useEffect(() => { load(); }, [load]);

  async function createResident(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/residents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        nik: form.nik || null, familyId: form.familyId || null,
        birthDate: form.birthDate || null,
        familyStatus: form.familyStatus || null,
        maritalStatus: form.maritalStatus || null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Penduduk ditambahkan", "success"); setAddOpen(false); setForm({ ...emptyResident }); load(); }
    else toast(json.error ?? "Gagal menambah penduduk", "error");
  }

  async function createFamily(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/families", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kkNumber: familyForm.kkNumber || null, address: familyForm.address || null, rt: familyForm.rt || null, rw: familyForm.rw || null }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Keluarga ditambahkan", "success"); setFamilyOpen(false); setFamilyForm({ kkNumber: "", address: "", rt: "", rw: "" }); load(); }
    else toast(json.error ?? "Gagal menambah keluarga", "error");
  }

  async function openDetail(id: string) {
    const res = await fetch(`/api/residents/${id}`);
    const json = await res.json();
    if (json.ok) setDetail(json.data);
    else toast(json.error ?? "Gagal memuat detail", "error");
  }

  async function changeStatus(id: string, eventType: string, newStatus: string, label: string) {
    const res = await fetch("/api/residents", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, eventType, eventDate: new Date().toISOString().slice(0, 10), newStatus, description: label }),
    });
    const json = await res.json();
    if (json.ok) { toast(`Status diubah: ${label}`, "success"); setDetail(null); load(); }
    else toast(json.error ?? "Gagal mengubah status", "error");
  }

  async function exportCsv() {
    const res = await fetch(`/api/residents?${new URLSearchParams({ page: "1", limit: "100", ...(query ? { q: query } : {}) })}`);
    const json = await res.json();
    if (!json.ok) return toast("Gagal mengekspor", "error");
    const header = "NIK,Nama,L/P,Tgl Lahir,Pendidikan,Pekerjaan,Status,RT,RW\n";
    const lines = json.data.residents.map((r: Resident) =>
      [r.nik ?? "", r.name, r.gender, r.birth_date ?? "", r.education ?? "", r.occupation ?? "", r.status, r.rt ?? "", r.rw ?? ""].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
    );
    const blob = new Blob(["\ufeff" + header + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `penduduk-page${page}.csv`;
    a.click();
    toast("CSV diunduh (halaman ini)", "success");
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const tabs = [["penduduk", "Penduduk"], ["keluarga", "Keluarga"]] as const;

  return (
    <div>
      <PageHeader
        title="Kependudukan"
        description="Registry penduduk dan keluarga desa"
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}><FileDown className="h-4 w-4" /> Ekspor CSV</Button>
            <Button variant="outline" onClick={() => setFamilyOpen(true)}><Home className="h-4 w-4" /> Tambah KK</Button>
            <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Tambah Penduduk</Button>
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Penduduk" value={total} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Total Keluarga" value={families?.length ?? "-"} />
        <StatCard label="Halaman" value={`${page} / ${totalPages}`} />
      </div>

      <div className="mb-4 flex gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("rounded-md px-3 py-1.5 text-sm", tab === key ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "penduduk" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Daftar Penduduk</CardTitle>
            <div className="flex gap-2">
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Cari nama / NIK..." className="pl-8" />
              </div>
              <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-36">
                <option value="">Semua status</option>
                <option value="tetap">Tetap</option>
                <option value="pendatang">Pendatang</option>
                <option value="tidak_tetap">Tidak Tetap</option>
                <option value="pindah">Pindah</option>
                <option value="meninggal">Meninggal</option>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {rows === null ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Memuat...</p>
            ) : rows.length === 0 ? (
              <EmptyState icon={Users} title="Belum ada data penduduk" description="Tambahkan penduduk pertama atau import data." />
            ) : (
              <>
                <DataTable
                  rows={rows}
                  columns={[
                    { key: "name", header: "Nama", render: (r) => (<div><button className="text-left font-medium hover:text-primary focus-ring rounded" onClick={() => openDetail(r.id)}>{r.name}</button><p className="text-xs text-muted-foreground">{r.nik ?? "NIK -"}</p></div>) },
                    { key: "gender", header: "L/P", render: (r) => r.gender },
                    { key: "birth", header: "Tgl Lahir", render: (r) => r.birth_date ?? "-" },
                    { key: "addr", header: "Alamat", render: (r) => (<span className="text-xs">Dusun {r.dusun_name ?? "-"} / RT {r.rt ?? "-"} / RW {r.rw ?? "-"}</span>) },
                    { key: "status", header: "Status", render: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? "muted"}>{r.status}</Badge> },
                  ]}
                />
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{total} penduduk</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "keluarga" && (
        <Card>
          <CardHeader><CardTitle>Daftar Keluarga (KK)</CardTitle></CardHeader>
          <CardContent className="pt-2">
            {families === null ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Memuat...</p>
            ) : families.length === 0 ? (
              <EmptyState icon={Home} title="Belum ada data keluarga" description="Tambahkan Kartu Keluarga pertama." />
            ) : (
              <DataTable
                rows={families}
                columns={[
                  { key: "kk", header: "No. KK", render: (f) => f.kk_number ?? "-" },
                  { key: "head", header: "Kepala Keluarga", render: (f) => f.head_name ?? "-" },
                  { key: "members", header: "Anggota", render: (f) => f.member_count },
                  { key: "addr", header: "Alamat", render: (f) => (<span className="text-xs">{f.address ?? "-"} · RT {f.rt ?? "-"} / RW {f.rw ?? "-"}</span>) },
                ]}
              />
            )}
          </CardContent>
        </Card>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Tambah Penduduk" className="max-w-2xl">
        <form onSubmit={createResident} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><Label htmlFor="r-name">Nama Lengkap</Label><Input id="r-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label htmlFor="r-nik">NIK (16 digit)</Label><Input id="r-nik" inputMode="numeric" pattern="\d{16}" value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value.replace(/\D/g, "").slice(0, 16) })} /></div>
          <div>
            <Label htmlFor="r-gender">Jenis Kelamin</Label>
            <Select id="r-gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </Select>
          </div>
          <div><Label htmlFor="r-bp">Tempat Lahir</Label><Input id="r-bp" value={form.birthPlace} onChange={(e) => setForm({ ...form, birthPlace: e.target.value })} /></div>
          <div><Label htmlFor="r-bd">Tanggal Lahir</Label><Input id="r-bd" type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></div>
          <div>
            <Label htmlFor="r-fam">Keluarga (KK)</Label>
            <Select id="r-fam" value={form.familyId} onChange={(e) => setForm({ ...form, familyId: e.target.value })}>
              <option value="">Tanpa KK</option>
              {(families ?? []).map((f) => <option key={f.id} value={f.id}>{f.kk_number ?? f.address ?? f.id} {f.head_name ? `(${f.head_name})` : ""}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="r-fstat">Hubungan Keluarga</Label>
            <Select id="r-fstat" value={form.familyStatus} onChange={(e) => setForm({ ...form, familyStatus: e.target.value })}>
              <option value="">Pilih</option>
              <option value="kepala_keluarga">Kepala Keluarga</option>
              <option value="istri">Istri</option>
              <option value="anak">Anak</option>
              <option value="fam_lain">Famili Lain</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="r-marital">Status Perkawinan</Label>
            <Select id="r-marital" value={form.maritalStatus} onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })}>
              <option value="">Pilih</option>
              <option value="belum_kawin">Belum Kawin</option>
              <option value="kawin">Kawin</option>
              <option value="cerai_hidup">Cerai Hidup</option>
              <option value="cerai_mati">Cerai Mati</option>
            </Select>
          </div>
          <div><Label htmlFor="r-edu">Pendidikan</Label><Input id="r-edu" value={form.education} onChange={(e) => setForm({ ...form, education: e.target.value })} placeholder="SMA" /></div>
          <div><Label htmlFor="r-occ">Pekerjaan</Label><Input id="r-occ" value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} placeholder="Petani" /></div>
          <div><Label htmlFor="r-rt">RT</Label><Input id="r-rt" value={form.rt} onChange={(e) => setForm({ ...form, rt: e.target.value })} /></div>
          <div><Label htmlFor="r-rw">RW</Label><Input id="r-rw" value={form.rw} onChange={(e) => setForm({ ...form, rw: e.target.value })} /></div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving || !form.name}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={familyOpen} onClose={() => setFamilyOpen(false)} title="Tambah Kartu Keluarga">
        <form onSubmit={createFamily} className="space-y-4">
          <div><Label htmlFor="f-kk">Nomor KK (16 digit)</Label><Input id="f-kk" inputMode="numeric" pattern="\d{16}" value={familyForm.kkNumber} onChange={(e) => setFamilyForm({ ...familyForm, kkNumber: e.target.value.replace(/\D/g, "").slice(0, 16) })} /></div>
          <div><Label htmlFor="f-addr">Alamat</Label><Input id="f-addr" value={familyForm.address} onChange={(e) => setFamilyForm({ ...familyForm, address: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="f-rt">RT</Label><Input id="f-rt" value={familyForm.rt} onChange={(e) => setFamilyForm({ ...familyForm, rt: e.target.value })} /></div>
            <div><Label htmlFor="f-rw">RW</Label><Input id="f-rw" value={familyForm.rw} onChange={(e) => setFamilyForm({ ...familyForm, rw: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setFamilyOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={`Detail: ${detail?.resident.name ?? ""}`} className="max-w-2xl">
        {detail && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">NIK:</span> {detail.resident.nik ?? "-"}</div>
              <div><span className="text-muted-foreground">KK:</span> {detail.resident.kk_number ?? "-"}</div>
              <div><span className="text-muted-foreground">Lahir:</span> {detail.resident.birth_place ?? "-"}, {detail.resident.birth_date ?? "-"}</div>
              <div><span className="text-muted-foreground">Pekerjaan:</span> {detail.resident.occupation ?? "-"}</div>
              <div><span className="text-muted-foreground">Pendidikan:</span> {detail.resident.education ?? "-"}</div>
              <div><span className="text-muted-foreground">Status:</span> <Badge variant={STATUS_VARIANT[detail.resident.status] ?? "muted"}>{detail.resident.status}</Badge></div>
            </div>

            {detail.duplicates.length > 0 && (
              <div className="rounded-lg bg-warning-soft p-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium text-yellow-800 dark:text-yellow-300">
                  <AlertTriangle className="h-4 w-4" /> Potensi data ganda terdeteksi
                </p>
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-medium">Ubah Status</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => changeStatus(detail.resident.id, "pindah", "pindah", "Pindah")}>Pindah</Button>
                <Button size="sm" variant="outline" onClick={() => changeStatus(detail.resident.id, "meninggal", "meninggal", "Meninggal")}>Meninggal</Button>
                <Button size="sm" variant="outline" onClick={() => changeStatus(detail.resident.id, "datang", "pendatang", "Pendatang")}>Tandai Pendatang</Button>
                <Button size="sm" variant="outline" onClick={() => changeStatus(detail.resident.id, "perubahan_kk", "tetap", "Kembali Tetap")}>Kembali Tetap</Button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Timeline</p>
              {detail.timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada peristiwa.</p>
              ) : (
                <ol className="space-y-2 border-l-2 border-border pl-4">
                  {detail.timeline.map((t, i) => (
                    <li key={i} className="relative text-sm">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                      <p className="font-medium">{t.event_type.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground">{t.event_date} {t.description ? `- ${t.description}` : ""}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
