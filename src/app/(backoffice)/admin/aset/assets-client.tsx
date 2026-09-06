"use client";

import * as React from "react";
import { Plus, Boxes, QrCode, Wrench, ArrowLeftRight, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, StatCard } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type Asset = {
  id: string; asset_code: string; name: string; category: string; condition: string;
  quantity: string; unit: string; acquisition_value: string | null; current_value: string | null;
  acquisition_date: string | null; location_text: string | null; status: string;
  custodian_name: string | null; total_maintenance_cost: string; last_maintenance: string | null;
};

const CATEGORIES = ["tanah","bangunan","kendaraan","peralatan","mesin","jalan","jembatan","drainase","lampu","fasilitas_umum","lainnya"];
const CONDITION_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  baik: "success", rusak_ringan: "warning", rusak_berat: "destructive",
};

function rupiah(n: string | number | null) { return n ? `Rp ${Number(n).toLocaleString("id-ID")}` : "-"; }

export function AssetsClient() {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<Asset[] | null>(null);
  const [stats, setStats] = React.useState<{ total: number; rusak_ringan: number; rusak_berat: number; total_value: string } | null>(null);
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [modal, setModal] = React.useState<"asset" | "maintenance" | "transfer" | "qr" | null>(null);
  const [qrAsset, setQrAsset] = React.useState<Asset | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [assetForm, setAssetForm] = React.useState({ name: "", category: "peralatan", acquisitionDate: "", acquisitionValue: "", condition: "baik", quantity: "1", unit: "unit", locationText: "" });
  const [maintForm, setMaintForm] = React.useState({ assetId: "", maintenanceType: "perbaikan", scheduledDate: "", description: "", cost: "" });
  const [transferForm, setTransferForm] = React.useState({ assetId: "", transferType: "mutasi", fromHolder: "", toHolder: "", transferDate: new Date().toISOString().slice(0, 10), newStatus: "aktif" });
  const [scanCode, setScanCode] = React.useState("");
  const [scanResult, setScanResult] = React.useState<Record<string, string> | null>(null);

  const load = React.useCallback(async () => {
    const params = new URLSearchParams();
    if (categoryFilter) params.set("category", categoryFilter);
    if (query) params.set("q", query);
    const res = await fetch(`/api/assets?${params}`);
    const json = await res.json();
    if (json.ok) { setRows(json.data.assets); setStats(json.data.stats); }
    else { setRows([]); toast(json.error ?? "Gagal memuat", "error"); }
  }, [categoryFilter, query, toast]);

  React.useEffect(() => { load(); }, [load]);

  async function createAsset(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/assets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "asset", name: assetForm.name, category: assetForm.category,
        acquisitionDate: assetForm.acquisitionDate || null,
        acquisitionValue: assetForm.acquisitionValue ? Number(assetForm.acquisitionValue) : null,
        condition: assetForm.condition, quantity: Number(assetForm.quantity), unit: assetForm.unit,
        locationText: assetForm.locationText || null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast(`Aset terdaftar: ${json.data.assetCode}`, "success"); setModal(null); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function scheduleMaintenance(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/assets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "maintenance", ...maintForm, scheduledDate: maintForm.scheduledDate || null, cost: maintForm.cost ? Number(maintForm.cost) : null }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Jadwal maintenance dibuat", "success"); setModal(null); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function transferAsset(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/assets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "transfer", ...transferForm, newStatus: transferForm.newStatus as "aktif" }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Mutasi tercatat", "success"); setModal(null); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function scan() {
    const res = await fetch("/api/assets/lookup", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: scanCode }),
    });
    const json = await res.json();
    if (json.ok) setScanResult(json.data);
    else { setScanResult(null); toast(json.error ?? "Aset tidak ditemukan", "error"); }
  }

  return (
    <div>
      <PageHeader
        title="Aset & Inventaris"
        description="Pendaftaran aset dengan QR tag, maintenance, dan mutasi"
        actions={
          <>
            <Button variant="outline" onClick={() => setModal("transfer")}><ArrowLeftRight className="h-4 w-4" /> Mutasi</Button>
            <Button variant="outline" onClick={() => setModal("maintenance")}><Wrench className="h-4 w-4" /> Maintenance</Button>
            <Button onClick={() => setModal("asset")}><Plus className="h-4 w-4" /> Daftar Aset</Button>
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <StatCard label="Total Aset" value={stats?.total ?? "-"} icon={<Boxes className="h-4 w-4" />} />
        <StatCard label="Rusak Ringan" value={stats?.rusak_ringan ?? "-"} />
        <StatCard label="Rusak Berat" value={stats?.rusak_berat ?? "-"} />
        <StatCard label="Total Nilai" value={stats ? rupiah(stats.total_value) : "-"} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Daftar Aset</CardTitle>
          <div className="flex gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama / kode..." className="w-44" />
            <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-36">
              <option value="">Semua kategori</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {rows === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Memuat...</p>
          ) : rows.length === 0 ? (
            <EmptyState icon={Boxes} title="Belum ada aset" description="Daftarkan aset desa pertama." />
          ) : (
            <DataTable
              rows={rows}
              columns={[
                { key: "name", header: "Aset", render: (a) => (<div><p className="font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{a.asset_code} · {a.category.replace(/_/g, " ")}</p></div>) },
                { key: "cond", header: "Kondisi", render: (a) => <Badge variant={CONDITION_VARIANT[a.condition] ?? "muted"}>{a.condition.replace(/_/g, " ")}</Badge> },
                { key: "value", header: "Nilai", render: (a) => rupiah(a.current_value) },
                { key: "maint", header: "Maintenance", render: (a) => a.last_maintenance ? new Date(a.last_maintenance).toLocaleDateString("id-ID") : "-" },
                { key: "custodian", header: "PJ", render: (a) => a.custodian_name ?? "-" },
                { key: "actions", header: "", className: "text-right", render: (a) => (
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setQrAsset(a); setModal("qr"); }} aria-label="QR tag"><QrCode className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => { setMaintForm({ ...maintForm, assetId: a.id }); setModal("maintenance"); }} aria-label="Maintenance"><Wrench className="h-4 w-4" /></Button>
                  </div>
                )},
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle className="flex items-center gap-2"><ScanLine className="h-4 w-4" /> Scan QR Aset (publik)</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={scanCode} onChange={(e) => setScanCode(e.target.value)} placeholder="Masukkan kode aset, mis. AST/PER/0001" className="max-w-xs" />
            <Button variant="outline" onClick={scan}>Cek</Button>
          </div>
          {scanResult && (
            <div className="mt-3 rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{scanResult.name}</p>
              <p className="text-xs text-muted-foreground">{scanResult.assetCode} · {scanResult.category} · {scanResult.villageName}</p>
              <Badge variant={CONDITION_VARIANT[scanResult.condition] ?? "muted"} className="mt-1">{scanResult.condition}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={modal === "asset"} onClose={() => setModal(null)} title="Daftarkan Aset" className="max-w-2xl">
        <form onSubmit={createAsset} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><Label htmlFor="a-name">Nama Aset</Label><Input id="a-name" required minLength={2} value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} /></div>
          <div>
            <Label htmlFor="a-cat">Kategori</Label>
            <Select id="a-cat" value={assetForm.category} onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="a-cond">Kondisi</Label>
            <Select id="a-cond" value={assetForm.condition} onChange={(e) => setAssetForm({ ...assetForm, condition: e.target.value })}>
              <option value="baik">Baik</option><option value="rusak_ringan">Rusak Ringan</option><option value="rusak_berat">Rusak Berat</option>
            </Select>
          </div>
          <div><Label htmlFor="a-date">Tgl Perolehan</Label><Input id="a-date" type="date" value={assetForm.acquisitionDate} onChange={(e) => setAssetForm({ ...assetForm, acquisitionDate: e.target.value })} /></div>
          <div><Label htmlFor="a-val">Nilai Perolehan (Rp)</Label><Input id="a-val" type="number" min="0" value={assetForm.acquisitionValue} onChange={(e) => setAssetForm({ ...assetForm, acquisitionValue: e.target.value })} /></div>
          <div><Label htmlFor="a-qty">Jumlah</Label><Input id="a-qty" type="number" min="0.01" step="0.01" value={assetForm.quantity} onChange={(e) => setAssetForm({ ...assetForm, quantity: e.target.value })} /></div>
          <div><Label htmlFor="a-unit">Satuan</Label><Input id="a-unit" value={assetForm.unit} onChange={(e) => setAssetForm({ ...assetForm, unit: e.target.value })} /></div>
          <div className="md:col-span-2"><Label htmlFor="a-loc">Lokasi</Label><Input id="a-loc" value={assetForm.locationText} onChange={(e) => setAssetForm({ ...assetForm, locationText: e.target.value })} /></div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === "maintenance"} onClose={() => setModal(null)} title="Jadwalkan Maintenance">
        <form onSubmit={scheduleMaintenance} className="space-y-4">
          <div>
            <Label htmlFor="m-asset">Aset</Label>
            <Select id="m-asset" required value={maintForm.assetId} onChange={(e) => setMaintForm({ ...maintForm, assetId: e.target.value })}>
              <option value="">Pilih aset</option>
              {(rows ?? []).map((a) => <option key={a.id} value={a.id}>{a.asset_code} - {a.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="m-type">Jenis</Label>
            <Select id="m-type" value={maintForm.maintenanceType} onChange={(e) => setMaintForm({ ...maintForm, maintenanceType: e.target.value })}>
              <option value="rutin">Rutin</option><option value="perbaikan">Perbaikan</option><option value="penggantian">Penggantian</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="m-date">Jadwal</Label><Input id="m-date" type="date" value={maintForm.scheduledDate} onChange={(e) => setMaintForm({ ...maintForm, scheduledDate: e.target.value })} /></div>
            <div><Label htmlFor="m-cost">Estimasi Biaya</Label><Input id="m-cost" type="number" min="0" value={maintForm.cost} onChange={(e) => setMaintForm({ ...maintForm, cost: e.target.value })} /></div>
          </div>
          <div><Label htmlFor="m-desc">Deskripsi</Label><Textarea id="m-desc" required minLength={3} value={maintForm.description} onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={saving || !maintForm.assetId}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === "transfer"} onClose={() => setModal(null)} title="Mutasi / Peminjaman / Penghapusan">
        <form onSubmit={transferAsset} className="space-y-4">
          <div>
            <Label htmlFor="tr-asset">Aset</Label>
            <Select id="tr-asset" required value={transferForm.assetId} onChange={(e) => setTransferForm({ ...transferForm, assetId: e.target.value })}>
              <option value="">Pilih aset</option>
              {(rows ?? []).map((a) => <option key={a.id} value={a.id}>{a.asset_code} - {a.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="tr-type">Jenis</Label>
            <Select id="tr-type" value={transferForm.transferType} onChange={(e) => setTransferForm({ ...transferForm, transferType: e.target.value, newStatus: e.target.value === "penghapusan" ? "dihapus" : e.target.value === "peminjaman" ? "dipinjam" : "aktif" })}>
              <option value="mutasi">Mutasi</option><option value="peminjaman">Peminjaman</option><option value="penghapusan">Penghapusan</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="tr-from">Dari</Label><Input id="tr-from" value={transferForm.fromHolder} onChange={(e) => setTransferForm({ ...transferForm, fromHolder: e.target.value })} /></div>
            <div><Label htmlFor="tr-to">Kepada</Label><Input id="tr-to" value={transferForm.toHolder} onChange={(e) => setTransferForm({ ...transferForm, toHolder: e.target.value })} /></div>
          </div>
          <div><Label htmlFor="tr-date">Tanggal</Label><Input id="tr-date" type="date" required value={transferForm.transferDate} onChange={(e) => setTransferForm({ ...transferForm, transferDate: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={saving || !transferForm.assetId}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === "qr"} onClose={() => setModal(null)} title="QR Tag Aset">
        {qrAsset && (
          <div className="space-y-3 text-center">
            <div className="mx-auto w-fit rounded-xl border-2 border-dashed border-primary bg-primary-soft p-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Aset Desa</p>
              <p className="mt-1 text-lg font-bold">{qrAsset.name}</p>
              <p className="mt-3 rounded-lg border bg-card px-4 py-2 font-mono text-lg tracking-widest">{qrAsset.asset_code}</p>
            </div>
            <p className="text-xs text-muted-foreground">Tempel kode ini pada aset. Siapa pun dapat mengecek kondisi aset lewat halaman scan QR publik.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
