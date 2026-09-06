"use client";

import * as React from "react";
import { Plus, Zap, Send, Play, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type Rule = { id: string; name: string; trigger_type: string; trigger_config: Record<string, unknown>; action_type: string; action_config: Record<string, unknown>; is_active: boolean; last_run_at: string | null; run_count: number };
type Run = { id: string; target_type: string; message: string; created_at: string; rule_name: string };

const TRIGGER_LABEL: Record<string, string> = {
  complaint_overdue: "Pengaduan lewat batas hari", letter_submitted: "Surat diajukan",
  letter_approved: "Surat disetujui", contract_expiring: "Kontrak mendekati habis",
  stock_low: "Stok menipis", aid_pending: "Bantuan belum disalurkan",
  booking_requested: "Booking fasilitas diminta", task_overdue: "Tugas lewat tenggat",
  sensor_warning: "Peringatan sensor", device_offline: "Perangkat offline",
};
const ACTION_LABEL: Record<string, string> = {
  create_notification: "Buat notifikasi", create_task: "Buat tugas",
  flag_warning: "Tandai peringatan", generate_log: "Catat log",
};

export function AutomationClient() {
  const { toast } = useToast();
  const [rules, setRules] = React.useState<Rule[] | null>(null);
  const [runs, setRuns] = React.useState<Run[]>([]);
  const [ruleOpen, setRuleOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [ruleForm, setRuleForm] = React.useState({ name: "", triggerType: "complaint_overdue", days: "3", actionType: "create_notification", message: "" });
  const [chatOpen, setChatOpen] = React.useState(false);
  const [chatLog, setChatLog] = React.useState<{ q: string; a: string }[]>([]);
  const [chatInput, setChatInput] = React.useState("");
  const [chatBusy, setChatBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/automation");
    const json = await res.json();
    if (json.ok) { setRules(json.data.rules); setRuns(json.data.runs); }
    else toast(json.error ?? "Gagal memuat", "error");
  }, [toast]);
  React.useEffect(() => { load(); }, [load]);

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/automation", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "rule", name: ruleForm.name, triggerType: ruleForm.triggerType,
        triggerConfig: { days: Number(ruleForm.days) || 3 },
        actionType: ruleForm.actionType,
        actionConfig: ruleForm.message ? { message: ruleForm.message } : {},
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Rule dibuat", "success"); setRuleOpen(false); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function evaluate() {
    const res = await fetch("/api/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "evaluate" }) });
    const json = await res.json();
    if (json.ok) { toast(`Engine dijalankan: ${json.data.fired} notifikasi dibuat`, "success"); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function toggle(ruleId: string) {
    const res = await fetch("/api/automation", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruleId }) });
    const json = await res.json();
    if (json.ok) load();
    else toast(json.error ?? "Gagal", "error");
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || chatBusy) return;
    setChatBusy(true);
    const q = chatInput;
    setChatInput("");
    setChatLog((l) => [...l, { q, a: "..." }]);
    const res = await fetch("/api/copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
    const json = await res.json();
    setChatBusy(false);
    const a = json.ok ? json.data.answer : (json.error ?? "Gagal");
    setChatLog((l) => { const c = [...l]; c[c.length - 1] = { q, a }; return c; });
  }

  return (
    <div>
      <PageHeader
        title="Automation & AI Copilot"
        description="Aturan otomatis WHEN/IF/THEN dan asisten data berbasis permission"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setChatLog([]); setChatOpen(true); }}><Bot className="h-4 w-4" /> Tanya Copilot</Button>
            <Button variant="outline" onClick={evaluate}><Play className="h-4 w-4" /> Jalankan Engine</Button>
            <Button onClick={() => setRuleOpen(true)}><Plus className="h-4 w-4" /> Rule Baru</Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Aturan Otomatis</CardTitle></CardHeader>
          <CardContent className="pt-2">
            {rules === null ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
            ) : rules.length === 0 ? (
              <EmptyState icon={Zap} title="Belum ada rule" description="Contoh: WHEN pengaduan > 3 hari THEN notifikasi." />
            ) : (
              <div className="space-y-2">
                {rules.map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        WHEN {TRIGGER_LABEL[r.trigger_type] ?? r.trigger_type}
                        {r.trigger_config?.days ? ` (${r.trigger_config.days} hari)` : ""}
                        {" "}THEN {ACTION_LABEL[r.action_type] ?? r.action_type}
                      </p>
                      <p className="text-xs text-muted-foreground">Dijalankan {r.run_count}x{r.last_run_at ? ` · terakhir ${new Date(r.last_run_at).toLocaleString("id-ID")}` : ""}</p>
                    </div>
                    <button onClick={() => toggle(r.id)} className="shrink-0">
                      <Badge variant={r.is_active ? "success" : "muted"}>{r.is_active ? "Aktif" : "Nonaktif"}</Badge>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Run Terakhir</CardTitle></CardHeader>
          <CardContent className="pt-2">
            {runs.length === 0 ? (
              <EmptyState icon={Zap} title="Belum ada run" description="Jalankan engine untuk mengevaluasi rules." />
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {runs.map((r) => (
                  <div key={r.id} className="rounded-lg border p-2.5">
                    <p className="text-xs font-medium text-muted-foreground">{r.rule_name} · {new Date(r.created_at).toLocaleString("id-ID")}</p>
                    <p className="text-sm">{r.message}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal open={ruleOpen} onClose={() => setRuleOpen(false)} title="Rule Otomatis Baru">
        <form onSubmit={createRule} className="space-y-4">
          <div><Label htmlFor="rl-name">Nama Rule</Label><Input id="rl-name" required value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} placeholder="Pengaduan 3 hari belum selesai" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rl-trig">WHEN (Trigger)</Label>
              <Select id="rl-trig" value={ruleForm.triggerType} onChange={(e) => setRuleForm({ ...ruleForm, triggerType: e.target.value })}>
                {Object.entries(TRIGGER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div><Label htmlFor="rl-days">Batas (hari)</Label><Input id="rl-days" type="number" min="1" value={ruleForm.days} onChange={(e) => setRuleForm({ ...ruleForm, days: e.target.value })} /></div>
          </div>
          <div>
            <Label htmlFor="rl-act">THEN (Aksi)</Label>
            <Select id="rl-act" value={ruleForm.actionType} onChange={(e) => setRuleForm({ ...ruleForm, actionType: e.target.value })}>
              {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <div><Label htmlFor="rl-msg">Pesan (opsional)</Label><Textarea id="rl-msg" value={ruleForm.message} onChange={(e) => setRuleForm({ ...ruleForm, message: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRuleOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={chatOpen} onClose={() => setChatOpen(false)} title="AI Village Copilot" className="max-w-xl">
        <div className="space-y-3">
          <p className="rounded-lg bg-primary-soft px-3 py-2 text-xs text-primary">
            Copilot menjawab dari data aktual sesuai izin Anda. Tidak mengarang angka, tidak membuat keputusan.
          </p>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {chatLog.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Contoh: &quot;Berapa pengaduan jalan rusak belum selesai?&quot;</p>}
            {chatLog.map((c, i) => (
              <div key={i} className="space-y-1">
                <div className="ml-auto w-fit max-w-[85%] rounded-xl bg-primary px-3 py-1.5 text-sm text-primary-foreground">{c.q}</div>
                <div className="w-fit max-w-[85%] whitespace-pre-line rounded-xl border px-3 py-1.5 text-sm">{c.a}</div>
              </div>
            ))}
          </div>
          <form onSubmit={ask} className="flex gap-2">
            <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Tanya data desa..." disabled={chatBusy} />
            <Button type="submit" size="icon" disabled={chatBusy} aria-label="Kirim"><Send className="h-4 w-4" /></Button>
          </form>
        </div>
      </Modal>
    </div>
  );
}
