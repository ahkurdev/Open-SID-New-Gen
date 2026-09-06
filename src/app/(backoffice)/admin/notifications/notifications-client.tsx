"use client";

import * as React from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/data-display";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

type Notification = {
  id: string;
  category: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationsClient() {
  const { toast } = useToast();
  const [items, setItems] = React.useState<Notification[] | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/notifications");
    const json = await res.json();
    if (json.ok) setItems(json.data.notifications);
    else setItems([]);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function markAll() {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
    toast("Semua notifikasi ditandai dibaca", "success");
    load();
  }

  return (
    <div>
      <PageHeader
        title="Notifikasi"
        description="Pusat notifikasi semua modul"
        actions={
          <Button variant="outline" onClick={markAll}>
            <CheckCheck className="h-4 w-4" /> Tandai semua dibaca
          </Button>
        }
      />
      {items === null ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Memuat...</p>
      ) : items.length === 0 ? (
        <EmptyState title="Belum ada notifikasi" description="Notifikasi akan muncul saat ada aktivitas yang relevan." />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id} className={"rounded-xl border bg-card p-4 " + (n.read_at ? "" : "border-primary/40")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{n.title}</p>
                    <Badge variant="muted">{n.category}</Badge>
                  </div>
                  {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString("id-ID")}</p>
                </div>
                {!n.read_at && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Belum dibaca" />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
