"use client";

import * as React from "react";
import { UserPlus, Search, ShieldCheck, Mail, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type UserRow = {
  id: string; email: string; name: string; phone: string | null;
  status: string; last_login_at: string | null; roles: string[];
};
type RoleRow = { id: string; key: string; name: string; is_system: boolean; permissions: string[] };
type InvitationRow = {
  id: string; email: string; roles: string[]; expires_at: string;
  accepted_at: string | null; revoked_at: string | null; created_at: string;
};
type Activity = {
  logins: { success: boolean; reason: string | null; ip: string | null; user_agent: string | null; created_at: string }[];
  audits: { action: string; entity_type: string; entity_id: string | null; created_at: string }[];
};

const PERMISSION_CATALOG = [
  "dashboard.view", "resident.read", "resident.create", "resident.update", "resident.delete",
  "letter.read", "letter.request", "letter.process", "letter.approve", "letter.sign",
  "complaint.read", "complaint.create", "complaint.assign", "complaint.resolve",
  "finance.read", "finance.manage", "aid.read", "aid.approve", "aid.distribute",
  "asset.manage", "project.manage", "public.publish", "user.manage", "role.manage",
  "audit.read", "report.read", "iot.manage", "settings.manage",
];

export function UsersClient() {
  const { toast } = useToast();
  const [tab, setTab] = React.useState<"users" | "roles" | "invitations">("users");
  const [rows, setRows] = React.useState<UserRow[] | null>(null);
  const [roles, setRoles] = React.useState<RoleRow[]>([]);
  const [invitations, setInvitations] = React.useState<InvitationRow[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [activity, setActivity] = React.useState<{ user: { name: string }; data: Activity } | null>(null);
  const [form, setForm] = React.useState({ name: "", email: "", phone: "", password: "", roleIds: [] as string[] });
  const [inviteForm, setInviteForm] = React.useState({ email: "", roleIds: [] as string[] });
  const [roleForm, setRoleForm] = React.useState<{ id?: string; key: string; name: string; permissions: string[] } | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const [u, i] = await Promise.all([fetch("/api/users"), fetch("/api/invitations")]);
    const uj = await u.json();
    const ij = await i.json();
    if (uj.ok) { setRows(uj.data.users); setRoles(uj.data.roles); } else { setRows([]); toast(uj.error ?? "Gagal memuat", "error"); }
    if (ij.ok) setInvitations(ij.data.invitations); else setInvitations([]);
  }, [toast]);

  React.useEffect(() => { load(); }, [load]);

  const filtered = (rows ?? []).filter(
    (r) => r.name.toLowerCase().includes(query.toLowerCase()) || r.email.toLowerCase().includes(query.toLowerCase())
  );

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, email: form.email, phone: form.phone || null, password: form.password, roleIds: form.roleIds }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Pengguna dibuat", "success"); setCreateOpen(false); setForm({ name: "", email: "", phone: "", password: "", roleIds: [] }); load(); }
    else toast(json.error ?? "Gagal membuat pengguna", "error");
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/invitations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inviteForm),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) {
      toast("Undangan dibuat. Link: " + json.data.inviteLink, "success");
      setInviteOpen(false);
      setInviteForm({ email: "", roleIds: [] });
      load();
    } else toast(json.error ?? "Gagal membuat undangan", "error");
  }

  async function revokeInvite(id: string) {
    const res = await fetch("/api/invitations", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (json.ok) { toast("Undangan dicabut", "success"); load(); }
    else toast(json.error ?? "Gagal mencabut", "error");
  }

  async function saveRole() {
    if (!roleForm) return;
    setSaving(true);
    const isNew = !roleForm.id;
    const res = await fetch("/api/roles", {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isNew
        ? { key: roleForm.key, name: roleForm.name, permissions: roleForm.permissions }
        : { roleId: roleForm.id, name: roleForm.name, permissions: roleForm.permissions }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast("Role disimpan", "success"); setRoleForm(null); load(); }
    else toast(json.error ?? "Gagal menyimpan role", "error");
  }

  async function openActivity(userId: string) {
    const res = await fetch(`/api/users/${userId}/activity`);
    const json = await res.json();
    if (json.ok) setActivity(json);
    else toast(json.error ?? "Gagal memuat aktivitas", "error");
  }

  const tabs = [
    ["users", "Pengguna"],
    ["roles", "Role & Permission"],
    ["invitations", "Undangan"],
  ] as const;

  return (
    <div>
      <PageHeader
        title="Pengguna & Hak Akses"
        description="Kelola akun, role, permission, dan undangan"
        actions={
          <>
            <Button variant="outline" onClick={() => setInviteOpen(true)}><Mail className="h-4 w-4" /> Undang</Button>
            <Button onClick={() => setCreateOpen(true)}><UserPlus className="h-4 w-4" /> Tambah Pengguna</Button>
          </>
        }
      />

      <div className="mb-4 flex gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn("rounded-md px-3 py-1.5 text-sm", tab === key ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Daftar Pengguna</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama / email..." className="pl-8" />
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {rows === null ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Memuat...</p>
            ) : filtered.length === 0 ? (
              <EmptyState icon={ShieldCheck} title="Tidak ada pengguna" description="Tambahkan pengguna atau kirim undangan." />
            ) : (
              <DataTable
                rows={filtered}
                columns={[
                  { key: "name", header: "Nama", render: (r) => (<div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.email}</p></div>) },
                  { key: "roles", header: "Role", render: (r) => (<div className="flex flex-wrap gap-1">{r.roles.map((x) => <Badge key={x} variant="muted">{x}</Badge>)}</div>) },
                  { key: "status", header: "Status", render: (r) => <Badge variant={r.status === "active" ? "success" : r.status === "locked" ? "warning" : "destructive"}>{r.status}</Badge> },
                  { key: "last_login", header: "Login Terakhir", render: (r) => r.last_login_at ? new Date(r.last_login_at).toLocaleString("id-ID") : "-" },
                  {
                    key: "actions", header: "", className: "text-right", render: (r) => (
                      <Button variant="ghost" size="sm" onClick={() => openActivity(r.id)} aria-label={`Aktivitas ${r.name}`}>
                        <History className="h-4 w-4" />
                      </Button>
                    ),
                  },
                ]}
              />
            )}
          </CardContent>
        </Card>
      )}

      {tab === "roles" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Role & Permission</CardTitle>
            <Button size="sm" onClick={() => setRoleForm({ key: "", name: "", permissions: [] })}>Buat Role</Button>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="grid gap-3 md:grid-cols-2">
              {roles.map((r) => (
                <div key={r.id} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{r.name}</p>
                    {r.is_system ? <Badge variant="muted">sistem</Badge> : (
                      <Button variant="ghost" size="sm" onClick={() => setRoleForm({ id: r.id, key: r.key, name: r.name, permissions: [...r.permissions] })}>
                        Edit
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.key} · {r.permissions.length} permission</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.permissions.slice(0, 8).map((p) => <Badge key={p} variant="muted">{p}</Badge>)}
                    {r.permissions.length > 8 && <Badge variant="muted">+{r.permissions.length - 8}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "invitations" && (
        <Card>
          <CardHeader><CardTitle>Undangan Aktif</CardTitle></CardHeader>
          <CardContent className="pt-2">
            {invitations === null ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Memuat...</p>
            ) : invitations.filter((i) => !i.accepted_at && !i.revoked_at).length === 0 ? (
              <EmptyState icon={Mail} title="Tidak ada undangan aktif" description="Kirim undangan untuk menambah perangkat desa baru." />
            ) : (
              <DataTable
                rows={invitations.filter((i) => !i.accepted_at && !i.revoked_at)}
                columns={[
                  { key: "email", header: "Email", render: (r) => <span className="font-medium">{r.email}</span> },
                  { key: "roles", header: "Role", render: (r) => (<div className="flex flex-wrap gap-1">{r.roles.map((x) => <Badge key={x} variant="muted">{x}</Badge>)}</div>) },
                  { key: "expires", header: "Kedaluwarsa", render: (r) => new Date(r.expires_at).toLocaleDateString("id-ID") },
                  { key: "actions", header: "", className: "text-right", render: (r) => (
                    <Button variant="outline" size="sm" onClick={() => revokeInvite(r.id)}>Cabut</Button>
                  )},
                ]}
              />
            )}
          </CardContent>
        </Card>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Tambah Pengguna">
        <form onSubmit={createUser} className="space-y-4">
          <div><Label htmlFor="u-name">Nama</Label><Input id="u-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label htmlFor="u-email">Email</Label><Input id="u-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label htmlFor="u-pass">Password Awal</Label><Input id="u-pass" type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <RolePicker roles={roles} selected={form.roleIds} onChange={(roleIds) => setForm({ ...form, roleIds })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving || form.roleIds.length === 0}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Undang Pengguna Baru">
        <form onSubmit={sendInvite} className="space-y-4">
          <div><Label htmlFor="i-email">Email</Label><Input id="i-email" type="email" required value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} /></div>
          <RolePicker roles={roles} selected={inviteForm.roleIds} onChange={(roleIds) => setInviteForm({ ...inviteForm, roleIds })} />
          <p className="text-xs text-muted-foreground">Penerima akan menerima email berisi tautan untuk mengaktifkan akun (dev: lihat vendor/logs/mail-outbox.log).</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving || inviteForm.roleIds.length === 0}>{saving ? "Mengirim..." : "Kirim Undangan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(roleForm)} onClose={() => setRoleForm(null)} title={roleForm?.id ? "Edit Role" : "Buat Role"}>
        {roleForm && (
          <div className="space-y-4">
            {!roleForm.id && (
              <div>
                <Label htmlFor="r-key">Key (huruf kecil, tanpa spasi)</Label>
                <Input id="r-key" required pattern="[a-z0-9_-]+" value={roleForm.key} onChange={(e) => setRoleForm({ ...roleForm, key: e.target.value })} />
              </div>
            )}
            <div><Label htmlFor="r-name">Nama</Label><Input id="r-name" required value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} /></div>
            <div>
              <Label>Permission</Label>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-3">
                {PERMISSION_CATALOG.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={roleForm.permissions.includes(p)}
                      onChange={(e) => setRoleForm({
                        ...roleForm,
                        permissions: e.target.checked ? [...roleForm.permissions, p] : roleForm.permissions.filter((x) => x !== p),
                      })}
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRoleForm(null)}>Batal</Button>
              <Button onClick={saveRole} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(activity)} onClose={() => setActivity(null)} title={`Aktivitas: ${activity?.user.name ?? ""}`} className="max-w-2xl">
        {activity && (
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium">Login Terakhir</p>
              <ul className="space-y-1.5">
                {activity.data.logins.length === 0 && <p className="text-sm text-muted-foreground">Belum ada aktivitas login.</p>}
                {activity.data.logins.slice(0, 10).map((l, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span>
                      <Badge variant={l.success ? "success" : "destructive"}>{l.success ? "sukses" : (l.reason ?? "gagal")}</Badge>
                      <span className="ml-2 text-muted-foreground">{l.ip ?? "-"}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString("id-ID")}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Aksi Terakhir</p>
              <ul className="space-y-1.5">
                {activity.data.audits.length === 0 && <p className="text-sm text-muted-foreground">Belum ada aksi tercatat.</p>}
                {activity.data.audits.slice(0, 10).map((a, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span>{a.action} <span className="text-muted-foreground">({a.entity_type})</span></span>
                    <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("id-ID")}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function RolePicker({
  roles, selected, onChange,
}: {
  roles: RoleRow[]; selected: string[]; onChange: (ids: string[]) => void;
}) {
  return (
    <div>
      <Label>Role</Label>
      <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border p-3">
        {roles.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(r.id)}
              onChange={(e) => onChange(e.target.checked ? [...selected, r.id] : selected.filter((x) => x !== r.id))}
            />
            {r.name}
          </label>
        ))}
      </div>
    </div>
  );
}
