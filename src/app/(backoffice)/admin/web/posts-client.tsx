"use client";

import * as React from "react";
import { Plus, Send, Archive, FileEdit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type Post = {
  id: string; type: string; title: string; slug: string; excerpt: string | null;
  category: string | null; status: string; published_at: string | null;
  scheduled_at: string | null; created_at: string; author_name: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  berita: "Berita", artikel: "Artikel", pengumuman: "Pengumuman", agenda: "Agenda",
};

export function PostsClient() {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<Post[] | null>(null);
  const [typeFilter, setTypeFilter] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({ type: "berita", title: "", excerpt: "", content: "", category: "", tags: "", status: "draft" });

  const load = React.useCallback(async () => {
    const params = typeFilter ? `?type=${typeFilter}` : "";
    const res = await fetch(`/api/posts${params}`);
    const json = await res.json();
    if (json.ok) setRows(json.data.posts);
    else { setRows([]); toast(json.error ?? "Gagal memuat", "error"); }
  }, [typeFilter, toast]);

  React.useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/posts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.type, title: form.title, excerpt: form.excerpt || null,
        content: form.content, category: form.category || null,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        status: form.status,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast(form.status === "published" ? "Terbit" : "Draft disimpan", "success"); setCreateOpen(false); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function setStatus(id: string, status: string) {
    const res = await fetch("/api/posts", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }),
    });
    const json = await res.json();
    if (json.ok) { toast(`Status: ${status}`, "success"); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function remove(id: string) {
    const res = await fetch("/api/posts", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (json.ok) { toast("Dihapus", "success"); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  return (
    <div>
      <PageHeader
        title="Website & Konten Publik"
        description="Kelola berita, artikel, pengumuman, dan agenda untuk website desa"
        actions={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Tulis Konten</Button>}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Daftar Konten</CardTitle>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-40">
            <option value="">Semua jenis</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </CardHeader>
        <CardContent className="pt-2">
          {rows === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Memuat...</p>
          ) : rows.length === 0 ? (
            <EmptyState title="Belum ada konten" description="Tulis berita atau pengumuman pertama." />
          ) : (
            <DataTable
              rows={rows}
              columns={[
                { key: "title", header: "Judul", render: (p) => (<div><p className="font-medium">{p.title}</p><p className="text-xs text-muted-foreground">{TYPE_LABEL[p.type] ?? p.type} · /{p.slug}</p></div>) },
                { key: "status", header: "Status", render: (p) => <Badge variant={p.status === "published" ? "success" : p.status === "draft" ? "warning" : "muted"}>{p.status}</Badge> },
                { key: "published", header: "Terbit", render: (p) => p.published_at ? new Date(p.published_at).toLocaleDateString("id-ID") : "-" },
                { key: "author", header: "Penulis", render: (p) => p.author_name ?? "-" },
                { key: "actions", header: "", className: "text-right", render: (p) => (
                  <div className="flex justify-end gap-1">
                    {p.status !== "published" && <Button variant="ghost" size="sm" onClick={() => setStatus(p.id, "published")} aria-label="Terbitkan"><Send className="h-4 w-4" /></Button>}
                    {p.status === "published" && <Button variant="ghost" size="sm" onClick={() => setStatus(p.id, "archived")} aria-label="Arsipkan"><Archive className="h-4 w-4" /></Button>}
                    <Button variant="ghost" size="sm" onClick={() => remove(p.id)} aria-label="Hapus"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                )},
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Tulis Konten" className="max-w-2xl">
        <form onSubmit={create} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pt-type">Jenis</Label>
              <Select id="pt-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="pt-status">Status</Label>
              <Select id="pt-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="draft">Draft</option>
                <option value="published">Terbitkan sekarang</option>
              </Select>
            </div>
          </div>
          <div><Label htmlFor="pt-title">Judul</Label><Input id="pt-title" required minLength={3} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label htmlFor="pt-excerpt">Ringkasan</Label><Input id="pt-excerpt" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} /></div>
          <div><Label htmlFor="pt-content">Isi</Label><Textarea id="pt-content" required minLength={10} rows={8} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="pt-cat">Kategori</Label><Input id="pt-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
            <div><Label htmlFor="pt-tags">Tag (koma)</Label><Input id="pt-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
