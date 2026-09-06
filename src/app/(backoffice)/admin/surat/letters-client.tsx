"use client";

import * as React from "react";
import { FileText, Plus, CheckCircle2, XCircle, PenTool, Send, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type LetterRow = {
  id: string; applicant_name: string; status: string; current_step: number;
  letter_number: string | null; verification_code: string | null; created_at: string;
  issued_at: string | null; sla_due_at: string | null; rejection_reason: string | null;
  template_name: string; template_code: string;
};
type Template = {
  id: string; code: string; name: string; description: string | null;
  form_schema: { key: string; label: string; type: string; required?: boolean; options?: string[] }[];
  approval_steps: string[]; sla_days: number; is_active: boolean;
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted" | "default"> = {
  submitted: "warning", in_review: "default", approved: "default",
  signed: "success", issued: "success", rejected: "destructive", cancelled: "muted",
};

const STEP_LABEL: Record<string, string> = {
  operator: "Operator", sekdes: "Sekretaris Desa", kades: "Kepala Desa",
};

export function LettersClient() {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<LetterRow[] | null>(null);
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [statusFilter, setStatusFilter] = React.useState("");
  const [submitOpen, setSubmitOpen] = React.useState(false);
  const [builderOpen, setBuilderOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<{ letter: LetterRow & { data: Record<string, unknown> }; timeline: { action: string; step_label: string | null; actor_name: string | null; notes: string | null; created_at: string }[] } | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<LetterRow | null>(null);
  const [rejectNotes, setRejectNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const [submitForm, setSubmitForm] = React.useState({ templateId: "", applicantName: "", residentId: "", formData: {} as Record<string, string> });
  const [builderForm, setBuilderForm] = React.useState({ code: "", name: "", description: "", slaDays: "5", steps: ["operator", "sekdes", "kades"] as string[], fields: [] as { key: string; label: string; type: string; required: boolean; options: string }[] });

  const load = React.useCallback(async () => {
    const params = new URLSearchParams({ page: "1", limit: "50" });
    if (statusFilter) params.set("status", statusFilter);
    const [l, t] = await Promise.all([fetch(`/api/letters?${params}`), fetch("/api/letter-templates")]);
    const lj = await l.json();
    const tj = await t.json();
    if (lj.ok) setRows(lj.data.letters);
    if (tj.ok) setTemplates((tj.data.templates as Template[]).filter((x) => x.is_active));
  }, [statusFilter]);

  React.useEffect(() => { load(); }, [load]);

  const selectedTemplate = templates.find((t) => t.id === submitForm.templateId);

  async function submitLetter(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/letters", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: submitForm.templateId,
        applicantName: submitForm.applicantName,
        residentId: submitForm.residentId || null,
        data: submitForm.formData,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Pengajuan surat dibuat", "success"); setSubmitOpen(false); setSubmitForm({ templateId: "", applicantName: "", residentId: "", formData: {} }); load(); }
    else toast(json.error ?? "Gagal mengajukan", "error");
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/letter-templates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: builderForm.code, name: builderForm.name,
        description: builderForm.description || null,
        formSchema: builderForm.fields.map((f) => ({
          key: f.key, label: f.label, type: f.type, required: f.required,
          ...(f.type === "select" && f.options ? { options: f.options.split(",").map((o) => o.trim()).filter(Boolean) } : {}),
        })),
        approvalSteps: builderForm.steps,
        slaDays: Number(builderForm.slaDays),
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Template surat dibuat", "success"); setBuilderOpen(false); load(); }
    else toast(json.error ?? "Gagal membuat template", "error");
  }

  async function act(id: string, action: string, notes?: string) {
    const res = await fetch("/api/letters", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, notes }),
    });
    const json = await res.json();
    if (json.ok) { toast("Aksi berhasil", "success"); setDetail(null); setRejectTarget(null); load(); }
    else toast(json.error ?? "Aksi gagal", "error");
  }

  async function openDetail(id: string) {
    const res = await fetch(`/api/letters/${id}`);
    const json = await res.json();
    if (json.ok) setDetail(json.data);
    else toast(json.error ?? "Gagal memuat", "error");
  }

  return (
    <div>
      <PageHeader
        title="Layanan Surat"
        description="Pengajuan surat dengan approval flow dinamis (no-code template builder)"
        actions={
          <>
            <Button variant="outline" onClick={() => setBuilderOpen(true)}>Template Builder</Button>
            <Button onClick={() => setSubmitOpen(true)}><Plus className="h-4 w-4" /> Ajukan Surat</Button>
          </>
        }
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Daftar Pengajuan</CardTitle>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
            <option value="">Semua status</option>
            <option value="submitted">Diajukan</option>
            <option value="in_review">Dalam Review</option>
            <option value="approved">Disetujui</option>
            <option value="signed">Ditandatangani</option>
            <option value="issued">Terbit</option>
            <option value="rejected">Ditolak</option>
            <option value="cancelled">Dibatalkan</option>
          </Select>
        </CardHeader>
        <CardContent className="pt-2">
          {rows === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Memuat...</p>
          ) : rows.length === 0 ? (
            <EmptyState icon={FileText} title="Belum ada pengajuan" description="Ajukan surat pertama atau buat template baru." />
          ) : (
            <DataTable
              rows={rows}
              columns={[
                { key: "tpl", header: "Jenis", render: (l) => (<div><button className="text-left font-medium hover:text-primary focus-ring rounded" onClick={() => openDetail(l.id)}>{l.template_name}</button><p className="text-xs text-muted-foreground">{l.letter_number ?? "-"}</p></div>) },
                { key: "applicant", header: "Pemohon", render: (l) => l.applicant_name },
                { key: "status", header: "Status", render: (l) => <Badge variant={STATUS_VARIANT[l.status] ?? "muted"}>{l.status.replace(/_/g, " ")}</Badge> },
                { key: "step", header: "Tahap", render: (l) => l.status === "submitted" || l.status === "in_review" ? STEP_LABEL[["operator", "sekdes", "kades"][l.current_step - 1] ?? "-"] ?? "-" : "-" },
                { key: "sla", header: "SLA", render: (l) => l.sla_due_at ? new Date(l.sla_due_at).toLocaleDateString("id-ID") : "-" },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Modal open={submitOpen} onClose={() => setSubmitOpen(false)} title="Ajukan Surat">
        <form onSubmit={submitLetter} className="space-y-4">
          <div>
            <Label htmlFor="s-tpl">Jenis Surat</Label>
            <Select id="s-tpl" required value={submitForm.templateId} onChange={(e) => setSubmitForm({ ...submitForm, templateId: e.target.value, formData: {} })}>
              <option value="">Pilih jenis surat</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div><Label htmlFor="s-name">Nama Pemohon</Label><Input id="s-name" required value={submitForm.applicantName} onChange={(e) => setSubmitForm({ ...submitForm, applicantName: e.target.value })} /></div>
          {selectedTemplate?.form_schema.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`s-f-${f.key}`}>{f.label}{f.required ? " *" : ""}</Label>
              {f.type === "textarea" ? (
                <Textarea id={`s-f-${f.key}`} required={f.required} value={submitForm.formData[f.key] ?? ""} onChange={(e) => setSubmitForm({ ...submitForm, formData: { ...submitForm.formData, [f.key]: e.target.value } })} />
              ) : f.type === "select" ? (
                <Select id={`s-f-${f.key}`} required={f.required} value={submitForm.formData[f.key] ?? ""} onChange={(e) => setSubmitForm({ ...submitForm, formData: { ...submitForm.formData, [f.key]: e.target.value } })}>
                  <option value="">Pilih</option>
                  {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                </Select>
              ) : (
                <Input id={`s-f-${f.key}`} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} required={f.required} value={submitForm.formData[f.key] ?? ""} onChange={(e) => setSubmitForm({ ...submitForm, formData: { ...submitForm.formData, [f.key]: e.target.value } })} />
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setSubmitOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving || !submitForm.templateId}>{saving ? "Mengirim..." : "Kirim Pengajuan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={builderOpen} onClose={() => setBuilderOpen(false)} title="Template Surat Baru (No-Code)" className="max-w-2xl">
        <form onSubmit={createTemplate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="b-code">Kode (huruf kecil)</Label><Input id="b-code" required pattern="[a-z0-9_]+" value={builderForm.code} onChange={(e) => setBuilderForm({ ...builderForm, code: e.target.value })} placeholder="sku_warga" /></div>
            <div><Label htmlFor="b-name">Nama Surat</Label><Input id="b-name" required value={builderForm.name} onChange={(e) => setBuilderForm({ ...builderForm, name: e.target.value })} placeholder="Surat Keterangan Usaha" /></div>
          </div>
          <div><Label htmlFor="b-desc">Deskripsi</Label><Input id="b-desc" value={builderForm.description} onChange={(e) => setBuilderForm({ ...builderForm, description: e.target.value })} /></div>
          <div>
            <Label>Alur Approval (urutan)</Label>
            <div className="flex gap-2">
              {["operator", "sekdes", "kades"].map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={builderForm.steps.includes(s)}
                    onChange={(e) => {
                      const steps = e.target.checked
                        ? ["operator", "sekdes", "kades"].filter((x) => builderForm.steps.includes(x) || x === s)
                        : builderForm.steps.filter((x) => x !== s);
                      setBuilderForm({ ...builderForm, steps });
                    }}
                  />
                  {STEP_LABEL[s]}
                </label>
              ))}
            </div>
          </div>
          <div><Label htmlFor="b-sla">SLA (hari)</Label><Input id="b-sla" type="number" min="1" max="60" value={builderForm.slaDays} onChange={(e) => setBuilderForm({ ...builderForm, slaDays: e.target.value })} /></div>

          <div>
            <Label>Formulir</Label>
            <div className="space-y-2">
              {builderForm.fields.map((f, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input placeholder="key" value={f.key} onChange={(e) => { const fields = [...builderForm.fields]; fields[i] = { ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }; setBuilderForm({ ...builderForm, fields }); }} className="w-32" />
                  <Input placeholder="Label" value={f.label} onChange={(e) => { const fields = [...builderForm.fields]; fields[i] = { ...f, label: e.target.value }; setBuilderForm({ ...builderForm, fields }); }} className="flex-1" />
                  <Select value={f.type} onChange={(e) => { const fields = [...builderForm.fields]; fields[i] = { ...f, type: e.target.value }; setBuilderForm({ ...builderForm, fields }); }} className="w-28">
                    <option value="text">Teks</option>
                    <option value="textarea">Paragraf</option>
                    <option value="number">Angka</option>
                    <option value="date">Tanggal</option>
                    <option value="select">Pilihan</option>
                  </Select>
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.required} onChange={(e) => { const fields = [...builderForm.fields]; fields[i] = { ...f, required: e.target.checked }; setBuilderForm({ ...builderForm, fields }); }} />Wajib</label>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setBuilderForm({ ...builderForm, fields: builderForm.fields.filter((_, x) => x !== i) })}><XCircle className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setBuilderForm({ ...builderForm, fields: [...builderForm.fields, { key: "", label: "", type: "text", required: false, options: "" }] })}>
                <Plus className="h-3.5 w-3.5" /> Tambah Kolom
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setBuilderOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving || builderForm.fields.length === 0}>{saving ? "Menyimpan..." : "Buat Template"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={`Surat: ${detail?.letter.template_name ?? ""}`} className="max-w-2xl">
        {detail && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Pemohon:</span> {detail.letter.applicant_name}</div>
              <div><span className="text-muted-foreground">Status:</span> <Badge variant={STATUS_VARIANT[detail.letter.status] ?? "muted"}>{detail.letter.status}</Badge></div>
              <div><span className="text-muted-foreground">Nomor:</span> {detail.letter.letter_number ?? "-"}</div>
              <div><span className="text-muted-foreground">Verifikasi:</span> {detail.letter.verification_code ?? "-"}</div>
            </div>
            {detail.letter.rejection_reason && (
              <p className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">Alasan penolakan: {detail.letter.rejection_reason}</p>
            )}

            {["submitted", "in_review", "approved"].includes(detail.letter.status) && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => act(detail.letter.id, "advance")}><CheckCircle2 className="h-4 w-4" /> Setujui Tahap Ini</Button>
                <Button size="sm" variant="destructive" onClick={() => setRejectTarget(detail.letter)}><XCircle className="h-4 w-4" /> Tolak</Button>
                <Button size="sm" variant="outline" onClick={() => act(detail.letter.id, "cancel")}><Ban className="h-4 w-4" /> Batalkan</Button>
              </div>
            )}
            {detail.letter.status === "approved" && (
              <Button size="sm" onClick={() => act(detail.letter.id, "sign")}><PenTool className="h-4 w-4" /> Tanda Tangan (Kades)</Button>
            )}
            {detail.letter.status === "signed" && (
              <Button size="sm" onClick={() => act(detail.letter.id, "issue")}><Send className="h-4 w-4" /> Terbitkan</Button>
            )}

            <div>
              <p className="mb-2 text-sm font-medium">Timeline</p>
              <ol className="space-y-2 border-l-2 border-border pl-4">
                {detail.timeline.map((t, i) => (
                  <li key={i} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                    <p className="font-medium">{t.action} {t.step_label ? `- ${t.step_label}` : ""}</p>
                    <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString("id-ID")} {t.actor_name ? `oleh ${t.actor_name}` : ""} {t.notes ? `- ${t.notes}` : ""}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)} title="Tolak Pengajuan">
        <div className="space-y-4">
          <div><Label htmlFor="rj-notes">Alasan Penolakan</Label><Textarea id="rj-notes" value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Batal</Button>
            <Button variant="destructive" onClick={() => rejectTarget && act(rejectTarget.id, "reject", rejectNotes || "Tidak memenuhi syarat")}>Tolak</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
