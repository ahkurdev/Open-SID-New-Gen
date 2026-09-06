"use client";

import * as React from "react";
import { Upload, Search, FileText, Trash2, QrCode, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type DocumentRow = {
  id: string; title: string; doc_number: string | null; doc_type: string;
  description: string | null; file_name: string; file_size: number;
  version: number; is_public: boolean; verification_code: string | null;
  tags: string[]; issued_at: string | null; expires_at: string | null;
  created_at: string; category_name: string | null; expiring_soon: boolean;
};

const TYPE_LABEL: Record<string, string> = {
  sk: "SK", perdes: "Perdes", perkades: "Perkades", surat_masuk: "Surat Masuk",
  surat_keluar: "Surat Keluar", kontrak: "Kontrak", proposal: "Proposal",
  laporan: "Laporan", berita_acara: "Berita Acara", foto: "Foto",
  tanah: "Dok. Tanah", aset: "Dok. Aset", lainnya: "Lainnya",
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentsClient() {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<DocumentRow[] | null>(null);
  const [total, setTotal] = React.useState(0);
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [qrDoc, setQrDoc] = React.useState<DocumentRow | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", docType: "sk", description: "", isPublic: false, issuedAt: "", expiresAt: "", tags: "" });
  const [file, setFile] = React.useState<File | null>(null);

  const load = React.useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (query) params.set("q", query);
    if (typeFilter) params.set("type", typeFilter);
    const res = await fetch(`/api/documents?${params}`);
    const json = await res.json();
    if (json.ok) { setRows(json.data.documents); setTotal(json.data.total); }
    else { setRows([]); toast(json.error ?? "Gagal memuat", "error"); }
  }, [page, query, typeFilter, toast]);

  React.useEffect(() => { load(); }, [load]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return toast("Pilih file terlebih dahulu", "error");
    setSaving(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("meta", JSON.stringify({
      title: form.title, docType: form.docType,
      description: form.description || null,
      isPublic: form.isPublic,
      issuedAt: form.issuedAt || null,
      expiresAt: form.expiresAt || null,
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    }));
    const res = await fetch("/api/documents", { method: "POST", body: fd });
    const json = await res.json();
    setSaving(false);
    if (json.ok) {
      toast(`Dokumen tersimpan. Nomor: ${json.data.docNumber}`, "success");
      setUploadOpen(false); setForm({ title: "", docType: "sk", description: "", isPublic: false, issuedAt: "", expiresAt: "", tags: "" }); setFile(null);
      load();
    } else toast(json.error ?? "Gagal mengunggah", "error");
  }

  async function removeDoc(id: string) {
    const res = await fetch("/api/documents", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (json.ok) { toast("Dokumen dihapus (soft delete)", "success"); load(); }
    else toast(json.error ?? "Gagal menghapus", "error");
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div>
      <PageHeader
        title="Arsip Dokumen"
        description="Dokumen desa: SK, Perdes, surat, kontrak, laporan - berversi & terverifikasi QR"
        actions={<Button onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /> Unggah Dokumen</Button>}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Daftar Dokumen ({total})</CardTitle>
          <div className="flex gap-2">
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Cari judul / nomor..." className="pl-8" />
            </div>
            <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="w-40">
              <option value="">Semua jenis</option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {rows === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Memuat...</p>
          ) : rows.length === 0 ? (
            <EmptyState icon={FileText} title="Belum ada dokumen" description="Unggah dokumen pertama desa Anda." />
          ) : (
            <>
              <DataTable
                rows={rows}
                columns={[
                  { key: "title", header: "Dokumen", render: (d) => (<div><p className="font-medium">{d.title}</p><p className="text-xs text-muted-foreground">{d.doc_number} · {TYPE_LABEL[d.doc_type] ?? d.doc_type} · v{d.version}</p></div>) },
                  { key: "file", header: "File", render: (d) => (<span className="text-xs">{d.file_name} ({fmtSize(d.file_size)})</span>) },
                  { key: "issued", header: "Terbit", render: (d) => d.issued_at ?? "-" },
                  { key: "expiry", header: "Kedaluwarsa", render: (d) => d.expires_at ? (<Badge variant={d.expiring_soon ? "warning" : "muted"}>{d.expires_at}</Badge>) : "-" },
                  { key: "public", header: "Akses", render: (d) => d.is_public ? <Badge variant="success">publik</Badge> : <Badge variant="muted">internal</Badge> },
                  { key: "actions", header: "", className: "text-right", render: (d) => (
                    <div className="flex justify-end gap-1">
                      {d.is_public && (
                        <Button variant="ghost" size="sm" onClick={() => setQrDoc(d)} aria-label="QR verification"><QrCode className="h-4 w-4" /></Button>
                      )}
                      <a href={`/api/documents/${d.id}/download`} className="inline-flex h-8 items-center rounded-lg border px-3 text-xs hover:bg-muted">Unduh</a>
                      <Button variant="ghost" size="sm" onClick={() => removeDoc(d.id)} aria-label="Hapus"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  )},
                ]}
              />
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Halaman {page} / {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Unggah Dokumen">
        <form onSubmit={upload} className="space-y-4">
          <div><Label htmlFor="d-title">Judul</Label><Input id="d-title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div>
            <Label htmlFor="d-type">Jenis</Label>
            <Select id="d-type" value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })}>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <div><Label htmlFor="d-desc">Deskripsi</Label><Textarea id="d-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="d-issued">Tanggal Terbit</Label><Input id="d-issued" type="date" value={form.issuedAt} onChange={(e) => setForm({ ...form, issuedAt: e.target.value })} /></div>
            <div><Label htmlFor="d-exp">Berlaku Sampai</Label><Input id="d-exp" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></div>
          </div>
          <div><Label htmlFor="d-tags">Tag (pisahkan koma)</Label><Input id="d-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="keuangan, 2026" /></div>
          <div>
            <Label htmlFor="d-file">File (maks 20MB: PDF, gambar, Office, teks)</Label>
            <Input id="d-file" type="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} />
            Dokumen publik (dapat diverifikasi via QR)
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving || !file}>{saving ? "Mengunggah..." : "Unggah"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(qrDoc)} onClose={() => setQrDoc(null)} title="Verifikasi Publik">
        {qrDoc && (
          <div className="space-y-3 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
            <p className="text-sm text-muted-foreground">Kode verifikasi dokumen ini:</p>
            <p className="rounded-lg border bg-muted/50 px-4 py-3 font-mono text-lg tracking-widest">{qrDoc.verification_code}</p>
            <p className="text-xs text-muted-foreground">
              Warga dapat membuka halaman verifikasi publik dan memasukkan kode ini untuk memeriksa keaslian dokumen.
              Nomor dokumen: {qrDoc.doc_number}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
