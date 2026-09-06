"use client";

import * as React from "react";
import { Plus, Wheat, Beef, Fish, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, StatCard } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type Farm = {
  id: string; sector: string; owner_name: string; owner_nik: string | null;
  commodity_name: string | null; land_area_m2: string | null; planting_season: string | null;
  livestock_type: string | null; livestock_count: number | null; pond_count: number | null;
  fish_type: string | null; production_kg: string | null; constraints_note: string | null;
  last_harvest_date: string | null; last_harvest_kg: string | null;
};
type Summary = { sector: string; unit_count: number; total_land_m2: string; total_livestock: number; total_production_kg: string; last_harvest_total_kg: string };

const SECTOR_META: Record<string, { label: string; icon: React.ElementType }> = {
  pertanian: { label: "Pertanian", icon: Wheat },
  peternakan: { label: "Peternakan", icon: Beef },
  perikanan: { label: "Perikanan", icon: Fish },
};

export function FarmsClient() {
  const { toast } = useToast();
  const [farms, setFarms] = React.useState<Farm[] | null>(null);
  const [summary, setSummary] = React.useState<Summary[]>([]);
  const [sectorFilter, setSectorFilter] = React.useState("");
  const [farmOpen, setFarmOpen] = React.useState(false);
  const [harvestOpen, setHarvestOpen] = React.useState<Farm | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [farmForm, setFarmForm] = React.useState({ sector: "pertanian", ownerName: "", commodityName: "", landAreaM2: "", plantingSeason: "", livestockType: "", livestockCount: "", pondCount: "", fishType: "", productionKg: "", constraintsNote: "" });
  const [harvestForm, setHarvestForm] = React.useState({ harvestDate: new Date().toISOString().slice(0, 10), commodity: "", quantityKg: "", notes: "" });

  const load = React.useCallback(async () => {
    const url = sectorFilter ? `/api/farms?sector=${sectorFilter}` : "/api/farms";
    const res = await fetch(url);
    const json = await res.json();
    if (json.ok) { setFarms(json.data.farms); setSummary(json.data.summary); }
    else toast(json.error ?? "Gagal memuat", "error");
  }, [sectorFilter, toast]);
  React.useEffect(() => { load(); }, [load]);

  async function createFarm(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const d = farmForm;
    const res = await fetch("/api/farms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "farm", sector: d.sector, ownerName: d.ownerName,
        commodityName: d.commodityName || null,
        landAreaM2: d.landAreaM2 ? Number(d.landAreaM2) : null,
        plantingSeason: d.plantingSeason || null,
        livestockType: d.livestockType || null,
        livestockCount: d.livestockCount ? Number(d.livestockCount) : null,
        pondCount: d.pondCount ? Number(d.pondCount) : null,
        fishType: d.fishType || null,
        productionKg: d.productionKg ? Number(d.productionKg) : null,
        constraintsNote: d.constraintsNote || null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Unit usaha ditambahkan", "success"); setFarmOpen(false); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function recordHarvest(e: React.FormEvent) {
    e.preventDefault();
    if (!harvestOpen) return;
    setSaving(true);
    const res = await fetch("/api/farms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "harvest", farmId: harvestOpen.id, harvestDate: harvestForm.harvestDate,
        commodity: harvestForm.commodity, quantityKg: Number(harvestForm.quantityKg),
        notes: harvestForm.notes || null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Panen tercatat", "success"); setHarvestOpen(null); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  const bySector = (s: string) => summary.find((x) => x.sector === s);

  return (
    <div>
      <PageHeader
        title="Pertanian, Peternakan & Perikanan"
        description="Data unit produksi, panen, dan indikator ketahanan pangan desa"
        actions={<Button onClick={() => setFarmOpen(true)}><Plus className="h-4 w-4" /> Unit Usaha Baru</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(SECTOR_META).map(([key, meta]) => {
          const s = bySector(key);
          const Icon = meta.icon;
          return (
            <StatCard
              key={key}
              label={meta.label}
              value={String(s?.unit_count ?? 0)}
              icon={<Icon className="h-5 w-5" />}
              hint={
                key === "pertanian" ? `${Number(s?.total_land_m2 ?? 0).toLocaleString("id-ID")} m2 lahan`
                : key === "peternakan" ? `${s?.total_livestock ?? 0} ekor ternak`
                : `${Number(s?.total_production_kg ?? 0).toLocaleString("id-ID")} kg produksi`
              }
            />
          );
        })}
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Daftar Unit Produksi</CardTitle>
          <Select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)} className="w-40">
            <option value="">Semua sektor</option>
            <option value="pertanian">Pertanian</option>
            <option value="peternakan">Peternakan</option>
            <option value="perikanan">Perikanan</option>
          </Select>
        </CardHeader>
        <CardContent className="pt-2">
          {farms === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
          ) : farms.length === 0 ? (
            <EmptyState icon={Sprout} title="Belum ada data" description="Catat petani, peternak, atau pembudidaya pertama." />
          ) : (
            <DataTable
              rows={farms}
              columns={[
                { key: "owner", header: "Pengelola", render: (f) => (<div><p className="font-medium">{f.owner_name}</p>{f.owner_nik && <p className="text-xs text-muted-foreground">{f.owner_nik}</p>}</div>) },
                { key: "sector", header: "Sektor", render: (f) => <Badge variant="muted">{SECTOR_META[f.sector]?.label ?? f.sector}</Badge> },
                { key: "commodity", header: "Komoditas", render: (f) => f.commodity_name ?? f.livestock_type ?? f.fish_type ?? "-" },
                { key: "detail", header: "Detail", render: (f) => (
                  <span className="text-xs text-muted-foreground">
                    {f.land_area_m2 ? `${Number(f.land_area_m2).toLocaleString("id-ID")} m2` : ""}
                    {f.livestock_count ? `${f.livestock_count} ekor` : ""}
                    {f.pond_count ? `${f.pond_count} kolam` : ""}
                    {f.planting_season ? ` · ${f.planting_season}` : ""}
                  </span>
                )},
                { key: "harvest", header: "Panen Terakhir", render: (f) => f.last_harvest_date ? `${new Date(f.last_harvest_date).toLocaleDateString("id-ID")} (${Number(f.last_harvest_kg ?? 0).toLocaleString("id-ID")} kg)` : "-" },
                { key: "actions", header: "", className: "text-right", render: (f) => (
                  <Button size="sm" variant="outline" onClick={() => { setHarvestOpen(f); setHarvestForm({ harvestDate: new Date().toISOString().slice(0, 10), commodity: f.commodity_name ?? f.livestock_type ?? f.fish_type ?? "", quantityKg: "", notes: "" }); }}>
                    Catat Panen
                  </Button>
                )},
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Modal open={farmOpen} onClose={() => setFarmOpen(false)} title="Unit Usaha Baru">
        <form onSubmit={createFarm} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ff-sector">Sektor</Label>
              <Select id="ff-sector" value={farmForm.sector} onChange={(e) => setFarmForm({ ...farmForm, sector: e.target.value })}>
                <option value="pertanian">Pertanian</option>
                <option value="peternakan">Peternakan</option>
                <option value="perikanan">Perikanan</option>
              </Select>
            </div>
            <div><Label htmlFor="ff-owner">Nama Pengelola</Label><Input id="ff-owner" required value={farmForm.ownerName} onChange={(e) => setFarmForm({ ...farmForm, ownerName: e.target.value })} /></div>
          </div>
          {farmForm.sector === "pertanian" && (
            <div className="grid grid-cols-3 gap-3">
              <div><Label htmlFor="ff-commodity">Komoditas</Label><Input id="ff-commodity" value={farmForm.commodityName} onChange={(e) => setFarmForm({ ...farmForm, commodityName: e.target.value })} placeholder="Padi" /></div>
              <div><Label htmlFor="ff-area">Luas (m2)</Label><Input id="ff-area" type="number" min="0" value={farmForm.landAreaM2} onChange={(e) => setFarmForm({ ...farmForm, landAreaM2: e.target.value })} /></div>
              <div><Label htmlFor="ff-season">Musim Tanam</Label><Input id="ff-season" value={farmForm.plantingSeason} onChange={(e) => setFarmForm({ ...farmForm, plantingSeason: e.target.value })} placeholder="MH 2026/1" /></div>
            </div>
          )}
          {farmForm.sector === "peternakan" && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="ff-ltype">Jenis Ternak</Label><Input id="ff-ltype" value={farmForm.livestockType} onChange={(e) => setFarmForm({ ...farmForm, livestockType: e.target.value })} placeholder="Sapi" /></div>
              <div><Label htmlFor="ff-lcount">Jumlah (ekor)</Label><Input id="ff-lcount" type="number" min="0" value={farmForm.livestockCount} onChange={(e) => setFarmForm({ ...farmForm, livestockCount: e.target.value })} /></div>
            </div>
          )}
          {farmForm.sector === "perikanan" && (
            <div className="grid grid-cols-3 gap-3">
              <div><Label htmlFor="ff-ftype">Jenis Ikan</Label><Input id="ff-ftype" value={farmForm.fishType} onChange={(e) => setFarmForm({ ...farmForm, fishType: e.target.value })} placeholder="Nila" /></div>
              <div><Label htmlFor="ff-ponds">Jumlah Kolam</Label><Input id="ff-ponds" type="number" min="0" value={farmForm.pondCount} onChange={(e) => setFarmForm({ ...farmForm, pondCount: e.target.value })} /></div>
              <div><Label htmlFor="ff-prod">Produksi (kg)</Label><Input id="ff-prod" type="number" min="0" value={farmForm.productionKg} onChange={(e) => setFarmForm({ ...farmForm, productionKg: e.target.value })} /></div>
            </div>
          )}
          <div><Label htmlFor="ff-constraints">Kendala</Label><Textarea id="ff-constraints" value={farmForm.constraintsNote} onChange={(e) => setFarmForm({ ...farmForm, constraintsNote: e.target.value })} placeholder="Hama, irigasi, modal..." /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setFarmOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!harvestOpen} onClose={() => setHarvestOpen(null)} title={`Catat Panen: ${harvestOpen?.owner_name ?? ""}`}>
        <form onSubmit={recordHarvest} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div><Label htmlFor="hf-date">Tanggal</Label><Input id="hf-date" type="date" required value={harvestForm.harvestDate} onChange={(e) => setHarvestForm({ ...harvestForm, harvestDate: e.target.value })} /></div>
            <div><Label htmlFor="hf-commodity">Komoditas</Label><Input id="hf-commodity" required value={harvestForm.commodity} onChange={(e) => setHarvestForm({ ...harvestForm, commodity: e.target.value })} /></div>
            <div><Label htmlFor="hf-qty">Jumlah (kg)</Label><Input id="hf-qty" type="number" min="0" step="any" required value={harvestForm.quantityKg} onChange={(e) => setHarvestForm({ ...harvestForm, quantityKg: e.target.value })} /></div>
          </div>
          <div><Label htmlFor="hf-notes">Catatan</Label><Textarea id="hf-notes" value={harvestForm.notes} onChange={(e) => setHarvestForm({ ...harvestForm, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setHarvestOpen(null)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Catat"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
