"use client";

import * as React from "react";
import Link from "next/link";
import { QrCode, FileText, ShieldAlert, Home, Users, LogOut, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/ui/toast";
import { logoutAction } from "@/app/actions/auth-actions";
import type { AuthContext } from "@/lib/db";

export type Data = {
  profile: { resident_id: string | null; village_name: string | null } | null;
  resident: {
    id: string; nik: string; name: string; gender: string; birth_date: string | null;
    status: string; occupation: string | null; phone: string | null; address: string | null;
    rt: string | null; rw: string | null; card_code: string | null; dusun_name: string | null;
  } | null;
  family: {
    kk_number: string | null; address: string | null; rt: string | null; rw: string | null;
    head_name: string | null; members: { name: string; status: string | null }[] | null;
  } | null;
  letters: { id: string; status: string; letter_number: string | null; created_at: string; template_name: string }[];
  corrections: { id: string; field_name: string; requested_value: string; status: string; created_at: string; review_notes: string | null }[];
  activeTemplates: { id: string; name: string; description: string | null; form_schema_placeholder?: { key: string; label: string; type: string; required?: boolean }[] }[];
};

const LETTER_STATUS: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  submitted: "warning", in_review: "warning", approved: "warning",
  signed: "success", issued: "success", rejected: "destructive", cancelled: "muted",
};

const EDITABLE: { key: string; label: string; type: string }[] = [
  { key: "phone", label: "Nomor Telepon", type: "text" },
  { key: "occupation", label: "Pekerjaan", type: "text" },
  { key: "education", label: "Pendidikan", type: "text" },
  { key: "address", label: "Alamat", type: "text" },
  { key: "religion", label: "Agama", type: "text" },
];

export function CitizenDashboard({ session, data }: { session: AuthContext; data: Data }) {
  const { toast } = useToast();
  const [cardOpen, setCardOpen] = React.useState(false);
  const [applyOpen, setApplyOpen] = React.useState(false);
  const [applyTemplate, setApplyTemplate] = React.useState<Data["activeTemplates"][number] | null>(null);
  const [applyForm, setApplyForm] = React.useState({ applicantName: data.resident?.name ?? session.name, formData: {} as Record<string, string> });
  const [correctOpen, setCorrectOpen] = React.useState(false);
  const [correctForm, setCorrectForm] = React.useState({ fieldName: "phone", requestedValue: "", reason: "" });
  const [saving, setSaving] = React.useState(false);

  const r = data.resident;

  async function applyLetter(e: React.FormEvent) {
    e.preventDefault();
    if (!applyTemplate) return;
    setSaving(true);
    const res = await fetch("/api/letters", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: applyTemplate.id,
        applicantName: applyForm.applicantName,
        residentId: r?.id ?? null,
        data: applyForm.formData,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Pengajuan terkirim, pantau statusnya di bawah", "success"); setApplyOpen(false); window.location.reload(); }
    else toast(json.error ?? "Gagal mengirim", "error");
  }

  async function submitCorrection(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/citizen/corrections", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(correctForm),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Permohonan koreksi terkirim", "success"); setCorrectOpen(false); setCorrectForm({ fieldName: "phone", requestedValue: "", reason: "" }); window.location.reload(); }
    else toast(json.error ?? "Gagal mengirim", "error");
  }

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">VO</div>
            <div>
              <p className="text-sm font-semibold leading-none">Portal Warga</p>
              <p className="text-xs text-muted-foreground">{data.profile?.village_name ?? "Desa"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <form action={logoutAction}>
              <Button variant="ghost" size="icon" type="submit" aria-label="Keluar"><LogOut className="h-4 w-4" /></Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 p-4 pb-16">
        {!r && (
          <Card className="border-warning">
            <CardContent className="flex items-start gap-3 p-4">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              <div>
                <p className="text-sm font-medium">Akun belum terhubung data kependudukan</p>
                <p className="text-sm text-muted-foreground">
                  Hubungi operator desa untuk menautkan akun Anda dengan data penduduk agar bisa mengajukan surat dan koreksi data.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {r && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Data Diri</CardTitle>
                <CardDescription>Data kependudukan Anda</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Nama</span><span className="font-medium">{r.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">NIK</span><span>{r.nik}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tgl Lahir</span><span>{r.birth_date ?? "-"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Pekerjaan</span><span>{r.occupation ?? "-"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Telepon</span><span>{r.phone ?? "-"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Alamat</span><span className="text-right">Dusun {r.dusun_name ?? "-"} / RT {r.rt ?? "-"} / RW {r.rw ?? "-"}</span></div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => setCorrectOpen(true)}>Ajukan Koreksi Data</Button>
                  <Button size="sm" variant="secondary" onClick={() => setCardOpen(true)}><QrCode className="h-4 w-4" /> Kartu Digital</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Home className="h-4 w-4" /> Kartu Keluarga</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {data.family ? (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">No. KK</span><span>{data.family.kk_number ?? "-"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Kepala Keluarga</span><span>{data.family.head_name ?? "-"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Alamat</span><span className="text-right">{data.family.address ?? "-"} RT {data.family.rt ?? "-"}/RW {data.family.rw ?? "-"}</span></div>
                    <div className="pt-2">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Users className="h-3.5 w-3.5" /> Anggota ({data.family.members?.length ?? 0})</p>
                      <ul className="space-y-0.5">
                        {(data.family.members ?? []).map((m, i) => (
                          <li key={i} className="flex justify-between text-xs">
                            <span>{m.name}</span>
                            <span className="text-muted-foreground">{m.status?.replace(/_/g, " ") ?? "-"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">Data KK belum tersedia.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Pengajuan Surat Saya</CardTitle>
              <CardDescription>Ajukan dan pantau surat secara online</CardDescription>
            </div>
            <Button size="sm" onClick={() => setApplyOpen(true)} disabled={!r}><Send className="h-4 w-4" /> Ajukan</Button>
          </CardHeader>
          <CardContent>
            {data.letters.length === 0 ? (
              <EmptyState icon={FileText} title="Belum ada pengajuan" description="Pengajuan surat Anda akan tampil di sini." />
            ) : (
              <ul className="space-y-2">
                {data.letters.map((l) => (
                  <li key={l.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm">
                    <div>
                      <p className="font-medium">{l.template_name}</p>
                      <p className="text-xs text-muted-foreground">{l.letter_number ?? "belum bernomor"} · {new Date(l.created_at).toLocaleDateString("id-ID")}</p>
                    </div>
                    <Badge variant={LETTER_STATUS[l.status] ?? "muted"}>{l.status.replace(/_/g, " ")}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {data.corrections.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Riwayat Koreksi Data</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {data.corrections.map((c) => (
                  <li key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm">
                    <div>
                      <p className="font-medium">{c.field_name}: &quot;{c.requested_value}&quot;</p>
                      <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString("id-ID")} {c.review_notes ? `- ${c.review_notes}` : ""}</p>
                    </div>
                    <Badge variant={c.status === "approved" ? "success" : c.status === "rejected" ? "destructive" : "warning"}>{c.status}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Verifikasi keaslian surat/dokumen: <Link href="/verify" className="text-primary hover:underline">halaman verifikasi publik</Link>
        </p>
      </main>

      <Modal open={cardOpen} onClose={() => setCardOpen(false)} title="Kartu Digital Warga">
        {r?.card_code && (
          <div className="space-y-3 text-center">
            <div className="mx-auto w-fit rounded-xl border-2 border-primary bg-primary-soft p-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Kartu Tanda Warga Digital</p>
              <p className="mt-1 text-lg font-bold">{r.name}</p>
              <p className="text-xs text-muted-foreground">NIK {r.nik}</p>
              <p className="mt-3 rounded-lg border bg-card px-4 py-2 font-mono text-lg tracking-widest">{r.card_code}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Kode ini untuk akses layanan desa tertentu (cek-in layanan, verifikasi identitas non-resmi).
              Bukan pengganti KTP.
            </p>
          </div>
        )}
      </Modal>

      <Modal open={applyOpen} onClose={() => setApplyOpen(false)} title="Ajukan Surat">
        <div className="space-y-4">
          <div>
            <Label htmlFor="a-tpl">Jenis Surat</Label>
            <Select id="a-tpl" value={applyTemplate?.id ?? ""} onChange={(e) => setApplyTemplate(data.activeTemplates.find((t) => t.id === e.target.value) ?? null)}>
              <option value="">Pilih jenis surat</option>
              {data.activeTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          {applyTemplate && (
            <>
              <div><Label htmlFor="a-name">Nama Pemohon</Label><Input id="a-name" required value={applyForm.applicantName} onChange={(e) => setApplyForm({ ...applyForm, applicantName: e.target.value })} /></div>
              {applyTemplate.form_schema_placeholder?.map((f) => (
                <div key={f.key}>
                  <Label htmlFor={`a-${f.key}`}>{f.label}{f.required ? " *" : ""}</Label>
                  {f.type === "textarea" ? (
                    <Textarea id={`a-${f.key}`} required={f.required} value={applyForm.formData[f.key] ?? ""} onChange={(e) => setApplyForm({ ...applyForm, formData: { ...applyForm.formData, [f.key]: e.target.value } })} />
                  ) : (
                    <Input id={`a-${f.key}`} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} required={f.required} value={applyForm.formData[f.key] ?? ""} onChange={(e) => setApplyForm({ ...applyForm, formData: { ...applyForm.formData, [f.key]: e.target.value } })} />
                  )}
                </div>
              ))}
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setApplyOpen(false)}>Batal</Button>
            <Button onClick={applyLetter as unknown as React.MouseEventHandler<HTMLButtonElement>} disabled={saving || !applyTemplate}>{saving ? "Mengirim..." : "Kirim"}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={correctOpen} onClose={() => setCorrectOpen(false)} title="Ajukan Koreksi Data">
        <form onSubmit={submitCorrection} className="space-y-4">
          <div>
            <Label htmlFor="c-field">Kolom yang dikoreksi</Label>
            <Select id="c-field" value={correctForm.fieldName} onChange={(e) => setCorrectForm({ ...correctForm, fieldName: e.target.value })}>
              {EDITABLE.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </Select>
          </div>
          <div><Label htmlFor="c-value">Nilai yang benar</Label><Input id="c-value" required value={correctForm.requestedValue} onChange={(e) => setCorrectForm({ ...correctForm, requestedValue: e.target.value })} /></div>
          <div><Label htmlFor="c-reason">Alasan</Label><Textarea id="c-reason" value={correctForm.reason} onChange={(e) => setCorrectForm({ ...correctForm, reason: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCorrectOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Mengirim..." : "Kirim Permohonan"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
