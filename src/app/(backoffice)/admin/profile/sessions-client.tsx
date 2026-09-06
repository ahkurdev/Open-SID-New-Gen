"use client";

import * as React from "react";
import { MonitorSmartphone, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

type SessionRow = {
  id: string; token_id: string; device: string | null; ip: string | null;
  created_at: string; last_seen_at: string; expires_at: string; is_current: boolean;
};

export function SessionsClient() {
  const { toast } = useToast();
  const [sessions, setSessions] = React.useState<SessionRow[] | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/sessions");
    const json = await res.json();
    setSessions(json.ok ? json.data.sessions : []);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function revoke(tokenId: string) {
    const res = await fetch("/api/sessions", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tokenId }),
    });
    const json = await res.json();
    if (json.ok) { toast("Sesi dicabut", "success"); load(); }
    else toast(json.error ?? "Gagal mencabut sesi", "error");
  }

  async function revokeOthers() {
    const res = await fetch("/api/sessions", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    const json = await res.json();
    if (json.ok) { toast("Sesi lain dicabut semua", "success"); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Sesi Aktif</CardTitle>
        <Button variant="outline" size="sm" onClick={revokeOthers}>Cabut Semua Sesi Lain</Button>
      </CardHeader>
      <CardContent>
        {sessions === null ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Memuat...</p>
        ) : sessions.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Tidak ada sesi aktif.</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      {s.device ?? "web"} {s.is_current && <Badge variant="success">perangkat ini</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      IP {s.ip ?? "-"} · mulai {new Date(s.created_at).toLocaleString("id-ID")} · aktif {new Date(s.last_seen_at).toLocaleString("id-ID")}
                    </p>
                  </div>
                </div>
                {!s.is_current && (
                  <Button variant="ghost" size="sm" onClick={() => revoke(s.token_id)} aria-label="Cabut sesi">
                    <LogOut className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
