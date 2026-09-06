"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, FileText, Wallet, MapPin, Boxes, HeartHandshake,
  Building2, Sprout, Store, Activity, Siren, BarChart3, Bot, Settings,
  ShieldCheck, LogOut, Search, Home,
} from "lucide-react";
import { Sidebar, Breadcrumb, type NavSection } from "@/components/layout";
import { CommandPalette } from "@/components/ui/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/actions/auth-actions";

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Utama",
    items: [
      { href: "/admin", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
      { href: "/admin/profil", label: "Profil Desa", icon: <Building2 className="h-4 w-4" /> },
      { href: "/admin/penduduk", label: "Penduduk", icon: <Users className="h-4 w-4" /> },
      { href: "/admin/surat", label: "Surat", icon: <FileText className="h-4 w-4" /> },
      { href: "/admin/pengaduan", label: "Pengaduan", icon: <Activity className="h-4 w-4" /> },
    ],
  },
  {
    title: "Pemerintahan",
    items: [
      { href: "/admin/keuangan", label: "Keuangan", icon: <Wallet className="h-4 w-4" /> },
      { href: "/admin/aset", label: "Aset", icon: <Boxes className="h-4 w-4" /> },
      { href: "/admin/bantuan", label: "Bantuan Sosial", icon: <HeartHandshake className="h-4 w-4" /> },
      { href: "/admin/pembangunan", label: "Pembangunan", icon: <Building2 className="h-4 w-4" /> },
    ],
  },
  {
    title: "Desa & Ekonomi",
    items: [
      { href: "/admin/web", label: "Website Publik", icon: <Home className="h-4 w-4" /> },
      { href: "/admin/gis", label: "Peta Desa", icon: <MapPin className="h-4 w-4" /> },
      { href: "/admin/pertanian", label: "Pertanian", icon: <Sprout className="h-4 w-4" /> },
      { href: "/admin/umkm", label: "UMKM & BUMDes", icon: <Store className="h-4 w-4" /> },
      { href: "/admin/keamanan", label: "Keamanan & Bencana", icon: <Siren className="h-4 w-4" /> },
    ],
  },
  {
    title: "Sistem",
    items: [
      { href: "/admin/iot", label: "Smart Village", icon: <Activity className="h-4 w-4" /> },
      { href: "/admin/analitik", label: "Analitik", icon: <BarChart3 className="h-4 w-4" /> },
      { href: "/admin/copilot", label: "AI Copilot", icon: <Bot className="h-4 w-4" /> },
      { href: "/admin/pengguna", label: "Pengguna & Hak Akses", icon: <ShieldCheck className="h-4 w-4" /> },
      { href: "/admin/settings", label: "Pengaturan", icon: <Settings className="h-4 w-4" /> },
    ],
  },
];

const COMMANDS = [
  { href: "/admin", label: "Dashboard", group: "Navigasi" },
  { href: "/admin/profil", label: "Profil Desa", group: "Navigasi" },
  { href: "/admin/penduduk", label: "Data Penduduk", group: "Navigasi" },
  { href: "/admin/surat", label: "Layanan Surat", group: "Navigasi" },
  { href: "/admin/pengaduan", label: "Pengaduan", group: "Navigasi" },
  { href: "/admin/antrean", label: "Antrean", group: "Navigasi" },
  { href: "/admin/web", label: "Website Publik", group: "Navigasi" },
  { href: "/admin/keuangan", label: "Keuangan", group: "Navigasi" },
  { href: "/admin/aset", label: "Aset", group: "Navigasi" },
  { href: "/admin/bantuan", label: "Bantuan Sosial", group: "Navigasi" },
  { href: "/admin/gis", label: "Peta Desa", group: "Navigasi" },
  { href: "/admin/pengguna", label: "Pengguna & Hak Akses", group: "Sistem" },
  { href: "/admin/settings", label: "Pengaturan", group: "Sistem" },
  { href: "/admin/profile", label: "Profil Saya", group: "Akun" },
];

export function AppShell({
  children,
  userName,
  userEmail,
  villageName,
  permissions,
  unreadCount,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  villageName: string;
  permissions: string[];
  unreadCount: number;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const visibleSections = React.useMemo(
    () =>
      NAV_SECTIONS.map((s) => ({
        ...s,
        items: s.items.filter((item) => {
          if (item.href === "/admin/pengguna") return permissions.includes("*") || permissions.includes("audit.read") || permissions.includes("user.manage");
          return true;
        }),
      })).filter((s) => s.items.length > 0),
    [permissions]
  );

  const crumbs = React.useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const items = [{ label: "Admin", href: "/admin" }];
    parts.slice(1).forEach((p, i) => {
      const href = "/" + parts.slice(0, i + 2).join("/");
      const label = p.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
      items.push({ label, href });
    });
    return items;
  }, [pathname]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        brand={`Village OS - ${villageName}`}
        sections={visibleSections}
        footer={
          <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {userName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{userName}</p>
              <p className="truncate text-[11px] text-muted-foreground">{userEmail}</p>
            </div>
            <form action={logoutAction}>
              <Button variant="ghost" size="icon" type="submit" aria-label="Keluar">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <div className="hidden md:block">
            <Breadcrumb items={crumbs} />
          </div>
          <div className="flex flex-1 justify-center px-2 md:justify-start">
            <CommandPalette
              actions={COMMANDS.map((c) => ({
                id: c.href,
                label: c.label,
                group: c.group,
                hint: c.href,
                run: () => router.push(c.href),
              }))}
            />
          </div>
          <div className="flex items-center gap-1">
            <Link href="/" className="hidden rounded-lg p-2 hover:bg-muted sm:block" aria-label="Website publik">
              <Home className="h-4 w-4" />
            </Link>
            <ThemeToggle />
            <Link href="/admin/notifications" className="relative rounded-lg p-2 hover:bg-muted" aria-label="Notifikasi">
              <Search className="hidden" />
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
