"use client";

import * as React from "react";
import { Plus, Building2, FileSignature, ReceiptText, ShoppingCart, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, StatCard } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type Vendor = { id: string; name: string; contact_person: string | null; phone: string | null; performance_score: string; is_blacklisted: boolean };
type PO = { id: string; po_no: string; title: string; amount: string; order_date: string; delivery_date: string | null; status: string; vendor_name: string };
type Contract = { id: string; contract_no: string; title: string; amount: string | null; start_date: string; end_date: string | null; status: string; vendor_name: string | null; expiring_soon: boolean };
type Invoice = { id: string; invoice_no: string; amount: string; due_date: string | null; status: string; vendor_name: string | null; overdue: boolean };

function rupiah(n: string | number) { return `Rp ${Number(n).toLocaleString("id-ID")}`; }

export function ProcurementClient() {
  const { toast } = useToast();
  const [tab, setTab] = React.useState<"po" | "kontrak" | "invoice" | "vendor">("po");
  const [vendors, setVendors] = React.useState<Vendor[] | null>(null);
  const [pos, setPos] = React.useState<PO[] | null>(null);
  const [contracts, setContracts] = React.useState<Contract[] | null>(null);
  const [invoices, setInvoices] = React.useState<Invoice[] | null>(null);
  const [modal, setModal] = React.useState<"vendor" | "po" | "contract" | "invoice" | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [vendorForm, setVendorForm] = React.useState({ name: "", contactPerson: "", phone: "" });
  const [poForm, setPoForm] = React.useState({ title: "", vendorId: "", amount: "", deliveryDate: "" });
  const [contractForm, setContractForm] = React.useState({ title: "", vendorId: "", amount: "", startDate: new Date().toISOString().slice(0, 10), endDate: "" });
  const [invoiceForm, setInvoiceForm] = React.useState({ purchaseOrderId: "", amount: "", dueDate: "" });

  const load = React.useCallback(async () => {
    const res = await fetch("/api/procurement");
    const json = await res.json();
    if (json.ok) {
      setVendors(json.data.vendors); setPos(json.data.purchaseOrders);
      setContracts(json.data.contracts); setInvoices(json.data.invoices);
    } else toast(json.error ?? "Gagal memuat", "error");
  }, [toast]);

  React.useEffect(() => { load(); }, [load]);

  async function submit(mode: string, payload: object, close: () => void) {
    setSaving(true);
    const res = await fetch("/api/procurement", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, ...payload }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Tersimpan", "success"); close(); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function updateStatus(kind: string, id: string, status: string) {
    const res = await fetch("/api/procurement", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, status }),
    });
    const json = await res.json();
    if (json.ok) { toast("Status diperbarui", "success"); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  const tabs = [["po", "Purchase Order"], ["kontrak", "Kontrak"], ["invoice", "Invoice"], ["vendor", "Vendor"]] as const;

  return (
    <div>
      <PageHeader
        title="Pengadaan & Kontrak"
        description="Vendor registry, PO, kontrak dengan reminder kedaluwarsa, dan invoice"
        actions={
          <>
            <Button variant="outline" onClick={() => setModal("vendor")}><Building2 className="h-4 w-4" /> Vendor</Button>
            <Button variant="outline" onClick={() => setModal("contract")}><FileSignature className="h-4 w-4" /> Kontrak</Button>
            <Button onClick={() => setModal("po")}><ShoppingCart className="h-4 w-4" /> PO Baru</Button>
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="PO Aktif" value={pos?.filter((p) => p.status === "open").length ?? "-"} />
        <StatCard label="Kontrak Aktif" value={contracts?.filter((c) => c.status === "active").length ?? "-"} />
        <StatCard label="Invoice Belum Bayar" value={invoices?.filter((i) => i.status === "unpaid").length ?? "-"} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <div className="mb-4 flex gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={"rounded-md px-3 py-1.5 text-sm " + (tab === key ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>{label}</button>
        ))}
      </div>

      {tab === "po" && (
        <Card>
          <CardHeader><CardTitle>Purchase Order</CardTitle></CardHeader>
          <CardContent className="pt-2">
            {pos === null ? <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
              : pos.length === 0 ? <EmptyState icon={ShoppingCart} title="Belum ada PO" />
                : <DataTable rows={pos} columns={[
                  { key: "po", header: "PO", render: (p) => (<div><p className="font-medium">{p.title}</p><p className="text-xs text-muted-foreground">{p.po_no} · {p.vendor_name}</p></div>) },
                  { key: "amount", header: "Nilai", render: (p) => rupiah(p.amount) },
                  { key: "date", header: "Tanggal", render: (p) => new Date(p.order_date).toLocaleDateString("id-ID") },
                  { key: "status", header: "Status", render: (p) => <Badge variant={p.status === "completed" ? "success" : p.status === "cancelled" ? "destructive" : "default"}>{p.status}</Badge> },
                  { key: "actions", header: "", className: "text-right", render: (p) => p.status === "open" ? (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => updateStatus("po", p.id, "delivered")}>Diterima</Button>
                      <Button size="sm" variant="secondary" onClick={() => updateStatus("po", p.id, "completed")}>Selesai</Button>
                    </div>
                  ) : null },
                ]} />}
          </CardContent>
        </Card>
      )}

      {tab === "kontrak" && (
        <Card>
          <CardHeader><CardTitle>Kontrak</CardTitle></CardHeader>
          <CardContent className="pt-2">
            {contracts === null ? <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
              : contracts.length === 0 ? <EmptyState icon={FileSignature} title="Belum ada kontrak" />
                : <DataTable rows={contracts} columns={[
                  { key: "c", header: "Kontrak", render: (c) => (<div><p className="font-medium">{c.title}</p><p className="text-xs text-muted-foreground">{c.contract_no} · {c.vendor_name ?? "-"}</p></div>) },
                  { key: "amount", header: "Nilai", render: (c) => c.amount ? rupiah(c.amount) : "-" },
                  { key: "end", header: "Berakhir", render: (c) => (<span className={c.expiring_soon ? "text-warning" : ""}>{c.end_date ?? "-"}{c.expiring_soon ? " (segera)" : ""}</span>) },
                  { key: "status", header: "Status", render: (c) => <Badge variant={c.status === "active" ? "success" : c.status === "expired" ? "destructive" : "muted"}>{c.status}</Badge> },
                ]} />}
          </CardContent>
        </Card>
      )}

      {tab === "invoice" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Invoice</CardTitle>
            <Button size="sm" onClick={() => setModal("invoice")}><ReceiptText className="h-4 w-4" /> Buat Invoice</Button>
          </CardHeader>
          <CardContent className="pt-2">
            {invoices === null ? <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
              : invoices.length === 0 ? <EmptyState icon={ReceiptText} title="Belum ada invoice" />
                : <DataTable rows={invoices} columns={[
                  { key: "inv", header: "Invoice", render: (i) => (<div><p className="font-medium">{i.invoice_no}</p><p className="text-xs text-muted-foreground">{i.vendor_name ?? "-"}</p></div>) },
                  { key: "amount", header: "Nilai", render: (i) => rupiah(i.amount) },
                  { key: "due", header: "Jatuh Tempo", render: (i) => (<span className={i.overdue ? "text-destructive" : ""}>{i.due_date ?? "-"}</span>) },
                  { key: "status", header: "Status", render: (i) => <Badge variant={i.status === "paid" ? "success" : i.overdue ? "destructive" : "warning"}>{i.status}</Badge> },
                  { key: "actions", header: "", className: "text-right", render: (i) => i.status === "unpaid" ? (
                    <Button size="sm" variant="secondary" onClick={() => updateStatus("invoice", i.id, "paid")}>Tandai Bayar</Button>
                  ) : null },
                ]} />}
          </CardContent>
        </Card>
      )}

      {tab === "vendor" && (
        <Card>
          <CardHeader><CardTitle>Vendor Registry</CardTitle></CardHeader>
          <CardContent className="pt-2">
            {vendors === null ? <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
              : vendors.length === 0 ? <EmptyState icon={Building2} title="Belum ada vendor" />
                : <DataTable rows={vendors} columns={[
                  { key: "name", header: "Vendor", render: (v) => (<div><p className="font-medium">{v.name}</p><p className="text-xs text-muted-foreground">{v.contact_person ?? "-"} · {v.phone ?? "-"}</p></div>) },
                  { key: "score", header: "Performa", render: (v) => `${v.performance_score}/5` },
                  { key: "blacklisted", header: "Status", render: (v) => v.is_blacklisted ? <Badge variant="destructive">blacklist</Badge> : <Badge variant="success">aktif</Badge> },
                ]} />}
          </CardContent>
        </Card>
      )}

      <Modal open={modal === "vendor"} onClose={() => setModal(null)} title="Vendor Baru">
        <form onSubmit={(e) => { e.preventDefault(); submit("vendor", vendorForm, () => setModal(null)); }} className="space-y-4">
          <div><Label htmlFor="v-name">Nama</Label><Input id="v-name" required minLength={2} value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} /></div>
          <div><Label htmlFor="v-cp">Kontak Person</Label><Input id="v-cp" value={vendorForm.contactPerson} onChange={(e) => setVendorForm({ ...vendorForm, contactPerson: e.target.value })} /></div>
          <div><Label htmlFor="v-phone">Telepon</Label><Input id="v-phone" value={vendorForm.phone} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={saving}>Simpan</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === "po"} onClose={() => setModal(null)} title="Purchase Order Baru">
        <form onSubmit={(e) => { e.preventDefault(); submit("po", { ...poForm, amount: Number(poForm.amount), deliveryDate: poForm.deliveryDate || null }, () => setModal(null)); }} className="space-y-4">
          <div><Label htmlFor="po-title">Judul</Label><Input id="po-title" required minLength={3} value={poForm.title} onChange={(e) => setPoForm({ ...poForm, title: e.target.value })} /></div>
          <div>
            <Label htmlFor="po-vendor">Vendor</Label>
            <Select id="po-vendor" required value={poForm.vendorId} onChange={(e) => setPoForm({ ...poForm, vendorId: e.target.value })}>
              <option value="">Pilih vendor</option>
              {(vendors ?? []).filter((v) => !v.is_blacklisted).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="po-amount">Nilai (Rp)</Label><Input id="po-amount" type="number" min="1" required value={poForm.amount} onChange={(e) => setPoForm({ ...poForm, amount: e.target.value })} /></div>
            <div><Label htmlFor="po-del">Target Kirim</Label><Input id="po-del" type="date" value={poForm.deliveryDate} onChange={(e) => setPoForm({ ...poForm, deliveryDate: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={saving || !poForm.vendorId}>Simpan</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === "contract"} onClose={() => setModal(null)} title="Kontrak Baru">
        <form onSubmit={(e) => { e.preventDefault(); submit("contract", { ...contractForm, amount: contractForm.amount ? Number(contractForm.amount) : null, vendorId: contractForm.vendorId || null, endDate: contractForm.endDate || null }, () => setModal(null)); }} className="space-y-4">
          <div><Label htmlFor="c-title">Judul</Label><Input id="c-title" required minLength={3} value={contractForm.title} onChange={(e) => setContractForm({ ...contractForm, title: e.target.value })} /></div>
          <div>
            <Label htmlFor="c-vendor">Vendor (opsional)</Label>
            <Select id="c-vendor" value={contractForm.vendorId} onChange={(e) => setContractForm({ ...contractForm, vendorId: e.target.value })}>
              <option value="">-</option>
              {(vendors ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label htmlFor="c-amount">Nilai</Label><Input id="c-amount" type="number" min="0" value={contractForm.amount} onChange={(e) => setContractForm({ ...contractForm, amount: e.target.value })} /></div>
            <div><Label htmlFor="c-start">Mulai</Label><Input id="c-start" type="date" required value={contractForm.startDate} onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })} /></div>
            <div><Label htmlFor="c-end">Berakhir</Label><Input id="c-end" type="date" value={contractForm.endDate} onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={saving}>Simpan</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === "invoice"} onClose={() => setModal(null)} title="Invoice dari PO">
        <form onSubmit={(e) => { e.preventDefault(); submit("invoice", { ...invoiceForm, amount: Number(invoiceForm.amount), dueDate: invoiceForm.dueDate || null }, () => setModal(null)); }} className="space-y-4">
          <div>
            <Label htmlFor="inv-po">PO</Label>
            <Select id="inv-po" required value={invoiceForm.purchaseOrderId} onChange={(e) => setInvoiceForm({ ...invoiceForm, purchaseOrderId: e.target.value })}>
              <option value="">Pilih PO</option>
              {(pos ?? []).filter((p) => p.status !== "cancelled").map((p) => <option key={p.id} value={p.id}>{p.po_no} - {p.title}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="inv-amount">Nilai (Rp)</Label><Input id="inv-amount" type="number" min="1" required value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} /></div>
            <div><Label htmlFor="inv-due">Jatuh Tempo</Label><Input id="inv-due" type="date" value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={saving || !invoiceForm.purchaseOrderId}>Simpan</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
