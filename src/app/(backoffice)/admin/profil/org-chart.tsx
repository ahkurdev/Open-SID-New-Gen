"use client";

import { Network } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { Official } from "./profile-client";

const HEAD_TITLES = ["Kepala Desa", "Kades", "Lurah"];

function isHead(o: Official) {
  return HEAD_TITLES.some((t) => o.position_title.toLowerCase().includes(t.toLowerCase()));
}

export function OrgChart({ officials }: { officials: Official[] }) {
  const active = officials.filter((o) => o.is_active);
  if (active.length === 0) {
    return <EmptyState icon={Network} title="Belum ada struktur" description="Tambahkan pejabat terlebih dahulu di tab Perangkat & Lembaga." />;
  }

  const head = active.find(isHead);
  const sekdes = active.find((o) => o.position_title.toLowerCase().includes("sekretaris"));
  const kaurKasi = active.filter(
    (o) => o !== head && o !== sekdes && o.type === "perangkat" && !isHead(o)
  );
  const bpd = active.filter((o) => o.type === "bpd");
  const lembaga = active.filter((o) => o.type === "lembaga");
  const wilayah = active.filter((o) => o.type === "wilayah");

  const Node = ({ o, wide }: { o: Official; wide?: boolean }) => (
    <div className={"rounded-xl border bg-card p-3 text-center shadow-sm " + (wide ? "min-w-44" : "min-w-36")}>
      <p className="text-sm font-medium">{o.name}</p>
      <p className="text-xs text-primary">{o.position_title}</p>
    </div>
  );

  const Section = ({ title, items }: { title: string; items: Official[] }) =>
    items.length === 0 ? null : (
      <div className="mt-4">
        <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {items.map((o) => <Node key={o.id} o={o} />)}
        </div>
      </div>
    );

  return (
    <div className="overflow-x-auto rounded-xl border bg-muted/30 p-6">
      <div className="min-w-max">
        {head && (
          <div className="flex justify-center">
            <div className="rounded-xl border-2 border-primary bg-primary-soft p-4 text-center shadow-sm min-w-48">
              <p className="font-semibold">{head.name}</p>
              <p className="text-sm text-primary">{head.position_title}</p>
            </div>
          </div>
        )}
        {(sekdes || kaurKasi.length > 0) && <div className="mx-auto h-6 w-px bg-border" />}
        {sekdes && (
          <div className="flex justify-center">
            <Node o={sekdes} wide />
          </div>
        )}
        <Section title="Kaur & Kasi" items={kaurKasi} />
        <Section title="Kepala Wilayah" items={wilayah} />
        <Section title="BPD" items={bpd} />
        <Section title="Lembaga" items={lembaga} />
      </div>
    </div>
  );
}
