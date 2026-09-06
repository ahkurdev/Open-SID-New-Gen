"use client";

import * as React from "react";
import { Plus, Store, Building, Briefcase, ShoppingBag, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, StatCard } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type Umkm = { id: string; owner_name: string; business_name: string; category: string; description: string | null; contact_phone: string | null; is_featured: boolean; is_public: boolean; product_count: number };
type Product = { id: string; umkm_id: string; name: string; description: string | null; price: string; unit: string; stock: number; is_featured: boolean; business_name: string };
type Order = { id: string; buyer_name: string; buyer_phone: string; quantity: number; note: string | null; status: string; created_at: string; product_name: string; business_name: string };
type BumdesUnit = { id: string; unit_name: string; business_type: string; description: string | null; manager_name: string | null; capital: string; revenue: string; expense: string; profit: string; period_year: number };
type Job = { id: string; title: string; employer: string; description: string | null; salary_info: string | null; location_text: string | null; is_open: boolean };
type Skill = { id: string; skill_name: string; proficiency: string; resident_name: string };
type Training = { id: string; title: string; description: string | null; organizer: string | null; start_date: string | null; location_text: string | null; quota: number | null; registered: number };

const TABS = ["umkm", "bumdes", "jobs"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { umkm: "UMKM & Marketplace", bumdes: "BUMDes", jobs: "Job & Skill Center" };

export function EconomyClient() {
  const { toast } = useToast();
  const [tab, setTab] = React.useState<Tab>("umkm");
  const [umkm, setUmkm] = React.useState<Umkm[] | null>(null);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [bumdes, setBumdes] = React.useState<BumdesUnit[] | null>(null);
  const [bumdesTotals, setBumdesTotals] = React.useState<{ revenue: string; expense: string; profit: string; unit_count: number } | null>(null);
  const [jobs, setJobs] = React.useState<Job[] | null>(null);
  const [skills, setSkills] = React.useState<Skill[]>([]);
  const [trainings, setTrainings] = React.useState<Training[]>([]);
  const [umkmOpen, setUmkmOpen] = React.useState(false);
  const [productOpen, setProductOpen] = React.useState<Umkm | null>(null);
  const [bumdesOpen, setBumdesOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [umkmForm, setUmkmForm] = React.useState({ ownerName: "", businessName: "", category: "kuliner", description: "", contactPhone: "" });
  const [productForm, setProductForm] = React.useState({ name: "", price: "", unit: "pcs", stock: "0" });
  const [bumdesForm, setBumdesForm] = React.useState({ unitName: "", businessType: "", managerName: "", capital: "", revenue: "", expense: "" });

  const load = React.useCallback(async () => {
    if (tab === "umkm") {
      const res = await fetch("/api/economy?view=umkm");
      const json = await res.json();
      if (json.ok) { setUmkm(json.data.umkm); setProducts(json.data.products); setOrders(json.data.orders); }
      else toast(json.error ?? "Gagal memuat", "error");
    } else if (tab === "bumdes") {
      const res = await fetch("/api/economy?view=bumdes");
      const json = await res.json();
      if (json.ok) { setBumdes(json.data.units); setBumdesTotals(json.data.totals); }
      else toast(json.error ?? "Gagal memuat", "error");
    } else {
      const res = await fetch("/api/economy?view=jobs");
      const json = await res.json();
      if (json.ok) { setJobs(json.data.jobs); setSkills(json.data.skills); setTrainings(json.data.trainings); }
      else toast(json.error ?? "Gagal memuat", "error");
    }
  }, [tab, toast]);
  React.useEffect(() => { load(); }, [load]);

  async function createUmkm(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/economy", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "umkm", ...umkmForm, description: umkmForm.description || null, contactPhone: umkmForm.contactPhone || null }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("UMKM terdaftar", "success"); setUmkmOpen(false); setUmkmForm({ ownerName: "", businessName: "", category: "kuliner", description: "", contactPhone: "" }); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!productOpen) return;
    setSaving(true);
    const res = await fetch("/api/economy", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "product", umkmId: productOpen.id, name: productForm.name, price: Number(productForm.price), unit: productForm.unit, stock: Number(productForm.stock) }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Produk ditambahkan", "success"); setProductOpen(null); setProductForm({ name: "", price: "", unit: "pcs", stock: "0" }); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function createBumdes(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const d = bumdesForm;
    const res = await fetch("/api/economy", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "bumdes", unitName: d.unitName, businessType: d.businessType, managerName: d.managerName || null, capital: d.capital ? Number(d.capital) : 0, revenue: d.revenue ? Number(d.revenue) : 0, expense: d.expense ? Number(d.expense) : 0 }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Unit BUMDes dicatat", "success"); setBumdesOpen(false); setBumdesForm({ unitName: "", businessType: "", managerName: "", capital: "", revenue: "", expense: "" }); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function updateOrder(orderId: string, status: string) {
    const res = await fetch("/api/economy", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "order_status", orderId, status }) });
    const json = await res.json();
    if (json.ok) { toast("Status pesanan diperbarui", "success"); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function toggleFeatured(umkmId: string) {
    const res = await fetch("/api/economy", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle_featured", umkmId }) });
    const json = await res.json();
    if (json.ok) load();
    else toast(json.error ?? "Gagal", "error");
  }

  return (
    <div>
      <PageHeader
        title="Ekonomi Lokal"
        description="UMMK & marketplace, BUMDes, lowongan kerja, skill & pelatihan warga"
        actions={
          tab === "umkm" ? <Button onClick={() => setUmkmOpen(true)}><Plus className="h-4 w-4" /> Daftar UMKM</Button>
          : tab === "bumdes" ? <Button onClick={() => setBumdesOpen(true)}><Plus className="h-4 w-4" /> Unit Usaha</Button>
          : null
        }
      />

      <div className="mb-4 flex gap-1 rounded-xl border p-1 w-fit">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={"rounded-lg px-4 py-1.5 text-sm font-medium transition-colors " + (tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "umkm" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="UMKM Terdaftar" value={String(umkm?.length ?? 0)} icon={<Store className="h-5 w-5" />} />
            <StatCard label="Produk" value={String(products.length)} icon={<ShoppingBag className="h-5 w-5" />} />
            <StatCard label="Pesanan Masuk" value={String(orders.length)} icon={<Briefcase className="h-5 w-5" />} />
          </div>

          <Card className="mt-4">
            <CardHeader><CardTitle>Daftar UMKM</CardTitle></CardHeader>
            <CardContent className="pt-2">
              {umkm === null ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
              ) : umkm.length === 0 ? (
                <EmptyState icon={Store} title="Belum ada UMKM" description="Daftarkan usaha warga pertama." />
              ) : (
                <DataTable
                  rows={umkm}
                  columns={[
                    { key: "name", header: "Usaha", render: (u) => (<div><p className="font-medium">{u.business_name}{u.is_featured && <Star className="ml-1 inline h-3.5 w-3.5 text-warning" />}</p><p className="text-xs text-muted-foreground">{u.owner_name} · {u.category}</p></div>) },
                    { key: "contact", header: "Kontak", render: (u) => u.contact_phone ?? "-" },
                    { key: "products", header: "Produk", render: (u) => String(u.product_count) },
                    { key: "visibility", header: "Publik", render: (u) => <Badge variant={u.is_public ? "success" : "muted"}>{u.is_public ? "Tampil" : "Tersembunyi"}</Badge> },
                    { key: "actions", header: "", className: "text-right", render: (u) => (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => toggleFeatured(u.id)} aria-label="Featured"><Star className={"h-4 w-4 " + (u.is_featured ? "fill-warning text-warning" : "")} /></Button>
                        <Button size="sm" variant="outline" onClick={() => setProductOpen(u)}><Plus className="h-4 w-4" /> Produk</Button>
                      </div>
                    )},
                  ]}
                />
              )}
            </CardContent>
          </Card>

          {orders.length > 0 && (
            <Card className="mt-4">
              <CardHeader><CardTitle>Pesanan Masuk</CardTitle></CardHeader>
              <CardContent className="pt-2">
                <DataTable
                  rows={orders}
                  columns={[
                    { key: "product", header: "Produk", render: (o) => (<div><p className="font-medium">{o.product_name}</p><p className="text-xs text-muted-foreground">{o.business_name}</p></div>) },
                    { key: "buyer", header: "Pembeli", render: (o) => (<div><p>{o.buyer_name}</p><p className="text-xs text-muted-foreground">{o.buyer_phone}</p></div>) },
                    { key: "qty", header: "Jumlah", render: (o) => String(o.quantity) },
                    { key: "status", header: "Status", render: (o) => <Badge variant={o.status === "completed" ? "success" : o.status === "cancelled" ? "destructive" : "warning"}>{o.status}</Badge> },
                    { key: "actions", header: "", className: "text-right", render: (o) => o.status === "requested" ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => updateOrder(o.id, "contacted")}>Hubungi</Button>
                        <Button size="sm" variant="ghost" onClick={() => updateOrder(o.id, "cancelled")}>Batal</Button>
                      </div>
                    ) : o.status === "contacted" ? (
                      <Button size="sm" variant="secondary" onClick={() => updateOrder(o.id, "completed")}>Selesai</Button>
                    ) : null },
                  ]}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {tab === "bumdes" && (
        <>
          {bumdesTotals && (
            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label="Unit Usaha" value={String(bumdesTotals.unit_count)} icon={<Building className="h-5 w-5" />} />
              <StatCard label="Pendapatan" value={Number(bumdesTotals.revenue).toLocaleString("id-ID")} icon={<Store className="h-5 w-5" />} />
              <StatCard label="Beban" value={Number(bumdesTotals.expense).toLocaleString("id-ID")} icon={<Store className="h-5 w-5" />} />
              <StatCard label="Laba" value={Number(bumdesTotals.profit).toLocaleString("id-ID")} icon={<Store className="h-5 w-5" />} />
            </div>
          )}
          <Card className="mt-4">
            <CardHeader><CardTitle>Unit Usaha BUMDes</CardTitle></CardHeader>
            <CardContent className="pt-2">
              {bumdes === null ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
              ) : bumdes.length === 0 ? (
                <EmptyState icon={Building} title="Belum ada unit usaha" description="Catat unit usaha BUMDes pertama." />
              ) : (
                <DataTable
                  rows={bumdes}
                  columns={[
                    { key: "unit", header: "Unit", render: (b) => (<div><p className="font-medium">{b.unit_name}</p><p className="text-xs text-muted-foreground">{b.business_type}{b.manager_name ? ` · ${b.manager_name}` : ""}</p></div>) },
                    { key: "year", header: "Tahun", render: (b) => String(b.period_year) },
                    { key: "capital", header: "Modal", render: (b) => Number(b.capital).toLocaleString("id-ID") },
                    { key: "revenue", header: "Pendapatan", render: (b) => Number(b.revenue).toLocaleString("id-ID") },
                    { key: "profit", header: "Laba", render: (b) => <span className={Number(b.profit) >= 0 ? "text-success" : "text-destructive"}>{Number(b.profit).toLocaleString("id-ID")}</span> },
                  ]}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {tab === "jobs" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Lowongan Kerja</CardTitle></CardHeader>
            <CardContent className="pt-2">
              {jobs === null ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
              ) : jobs.length === 0 ? (
                <EmptyState icon={Briefcase} title="Belum ada lowongan" />
              ) : (
                <ul className="space-y-2">
                  {jobs.map((j) => (
                    <li key={j.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{j.title}</p>
                        <p className="text-xs text-muted-foreground">{j.employer}{j.location_text ? ` · ${j.location_text}` : ""}{j.salary_info ? ` · ${j.salary_info}` : ""}</p>
                      </div>
                      <Badge variant={j.is_open ? "success" : "muted"}>{j.is_open ? "Buka" : "Tutup"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Pelatihan & Skill Warga</CardTitle></CardHeader>
            <CardContent className="pt-2 space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pelatihan</p>
                {trainings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada pelatihan.</p>
                ) : (
                  <ul className="space-y-2">
                    {trainings.map((t) => (
                      <li key={t.id} className="rounded-lg border p-3">
                        <p className="text-sm font-medium">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{t.organizer ?? "-"}{t.start_date ? ` · ${new Date(t.start_date).toLocaleDateString("id-ID")}` : ""} · terdaftar {t.registered}{t.quota ? `/${t.quota}` : ""}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Skill warga (yang mengizinkan tampil publik)</p>
                {skills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada skill publik.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {skills.map((s) => (
                      <Badge key={s.id} variant="muted">{s.skill_name} · {s.proficiency} · {s.resident_name}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Modal open={umkmOpen} onClose={() => setUmkmOpen(false)} title="Daftar UMKM">
        <form onSubmit={createUmkm} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="uf-owner">Nama Pemilik</Label><Input id="uf-owner" required value={umkmForm.ownerName} onChange={(e) => setUmkmForm({ ...umkmForm, ownerName: e.target.value })} /></div>
            <div><Label htmlFor="uf-biz">Nama Usaha</Label><Input id="uf-biz" required value={umkmForm.businessName} onChange={(e) => setUmkmForm({ ...umkmForm, businessName: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="uf-cat">Kategori</Label>
              <Select id="uf-cat" value={umkmForm.category} onChange={(e) => setUmkmForm({ ...umkmForm, category: e.target.value })}>
                <option value="kuliner">Kuliner</option><option value="fashion">Fashion</option>
                <option value="kerajinan">Kerajinan</option><option value="pertanian">Pertanian</option>
                <option value="jasa">Jasa</option><option value="teknologi">Teknologi</option><option value="lainnya">Lainnya</option>
              </Select>
            </div>
            <div><Label htmlFor="uf-phone">Kontak</Label><Input id="uf-phone" value={umkmForm.contactPhone} onChange={(e) => setUmkmForm({ ...umkmForm, contactPhone: e.target.value })} /></div>
          </div>
          <div><Label htmlFor="uf-desc">Deskripsi</Label><Textarea id="uf-desc" value={umkmForm.description} onChange={(e) => setUmkmForm({ ...umkmForm, description: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setUmkmOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!productOpen} onClose={() => setProductOpen(null)} title={`Produk: ${productOpen?.business_name ?? ""}`}>
        <form onSubmit={createProduct} className="space-y-4">
          <div><Label htmlFor="pf-name">Nama Produk</Label><Input id="pf-name" required value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label htmlFor="pf-price">Harga</Label><Input id="pf-price" type="number" min="0" required value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} /></div>
            <div><Label htmlFor="pf-unit">Satuan</Label><Input id="pf-unit" value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })} /></div>
            <div><Label htmlFor="pf-stock">Stok</Label><Input id="pf-stock" type="number" min="0" value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setProductOpen(null)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Tambah"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={bumdesOpen} onClose={() => setBumdesOpen(false)} title="Unit Usaha BUMDes">
        <form onSubmit={createBumdes} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="bf-name">Nama Unit</Label><Input id="bf-name" required value={bumdesForm.unitName} onChange={(e) => setBumdesForm({ ...bumdesForm, unitName: e.target.value })} placeholder="Unit Air Minum" /></div>
            <div><Label htmlFor="bf-type">Jenis Usaha</Label><Input id="bf-type" required value={bumdesForm.businessType} onChange={(e) => setBumdesForm({ ...bumdesForm, businessType: e.target.value })} placeholder="Air minum dalam kemasan" /></div>
          </div>
          <div><Label htmlFor="bf-mgr">Pengelola</Label><Input id="bf-mgr" value={bumdesForm.managerName} onChange={(e) => setBumdesForm({ ...bumdesForm, managerName: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label htmlFor="bf-cap">Modal</Label><Input id="bf-cap" type="number" min="0" value={bumdesForm.capital} onChange={(e) => setBumdesForm({ ...bumdesForm, capital: e.target.value })} /></div>
            <div><Label htmlFor="bf-rev">Pendapatan</Label><Input id="bf-rev" type="number" min="0" value={bumdesForm.revenue} onChange={(e) => setBumdesForm({ ...bumdesForm, revenue: e.target.value })} /></div>
            <div><Label htmlFor="bf-exp">Beban</Label><Input id="bf-exp" type="number" min="0" value={bumdesForm.expense} onChange={(e) => setBumdesForm({ ...bumdesForm, expense: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setBumdesOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
