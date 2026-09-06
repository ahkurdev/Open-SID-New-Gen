# DEVELOPMENT PHASES

Legend: [x] selesai & terverifikasi, [~] berjalan, [ ] belum.

[x] Phase 1 — Foundation & Design System
[x] Phase 2 — Multi-tenant, Auth, Role & Security
[x] Phase 3 — Profil & Struktur Pemerintahan Desa
[x] Phase 4 — Population & Family Registry
[ ] Phase 5 — Digital Document & Archive Center
[ ] Phase 6 — Letter Service & Workflow Builder
[ ] Phase 7 — Citizen Portal (Super App Warga)
[ ] Phase 8 — Front Office, Queue & Appointment
[ ] Phase 9 — Complaint & Case Management
[ ] Phase 10 — Public Website & Open Government
[ ] Phase 11 — Government Workspace
[ ] Phase 12 — Participatory Planning (E-Musrenbang)
[ ] Phase 13 — Finance & Budget Intelligence
[ ] Phase 14 — Procurement, Contract & Vendor
[ ] Phase 15 — Asset, Inventory & Infrastructure
[ ] Phase 16 — Social Aid & Welfare Intelligence
[ ] Phase 17 — GIS & Village Digital Twin
[ ] Phase 18 — Agriculture, Livestock, Fishery
[ ] Phase 19 — BUMDes, UMKM & Local Economy
[ ] Phase 20 — Health, Education & Social Services
[ ] Phase 21 — Disaster, Environment & Safety
[ ] Phase 22 — Community, Facility & Event
[ ] Phase 23 — AI Village Copilot & Automation
[ ] Phase 24 — Executive Analytics & Open Data
[ ] Phase 25 — Integration, PWA, Security, Production

---

## Phase 1 — Foundation & Design System

Status: SELESAI

Fitur:
- Next.js 15 + TS + Tailwind v4 scaffold, src dir, alias @/*
- Postgres 16 portable (vendor/pgsql), scripts db-up/db-reset/migrate/seed
- Design system: Button, Input, Card, Badge, Table, Modal, Toast, Skeleton,
  EmptyState, ErrorState, ConfirmDialog, CommandPalette, DataTable
- Layout back office: sidebar + navbar + breadcrumb + theme toggle
- Halaman: /, /login, /forgot-password, /reset-password, /admin (dashboard),
  /admin/profile, /admin/settings, /403, 404, 500, /onboarding
- Middleware auth guard /admin /warga /onboarding

Database migration: 001_core, 002_auth_functions, 003_password_reset, 004_lockout_fix

API: /api/health, /api/profile, /api/notifications

Tests: tests/phase1.test.mjs (7) + tests/auth.test.mjs (3)

---

## Phase 2 — Multi-tenant, Auth, Role & Security

Status: SELESAI

Fitur:
- Undangan user via email (token hash, expiry 7 hari, revoke, accept flow
  dengan set password + verifikasi email otomatis)
- Session management: daftar sesi aktif, cabut satu / semua sesi lain
- Login activity per user + riwayat aksi (audit) di halaman Pengguna
- Rate limiting login & forgot-password (DB-backed sliding window)
- Deteksi login mencurigakan: IP baru vs riwayat -> notifikasi in-app
- Custom Role Builder: buat/edit role custom + katalog permission
- Multi-village: API /api/villages (platform admin), seed 2 desa untuk isolasi

Database migration: 005_invitations, 006_rate_limit

API: /api/invitations (+ /accept), /api/sessions, /api/users/[id]/activity,
/api/villages, /api/roles, /api/users

Tests: tests/phase2.test.mjs (6)

---

## Phase 3 — Profil & Struktur Pemerintahan Desa

Status: SELESAI

Fitur:
- Profil desa: identitas, kode wilayah, alamat, kontak, koordinat, luas,
  visi, misi, sejarah desa
- Data pejabat: perangkat desa, BPD, lembaga, kepala wilayah (dusun/RW/RT
  via regions)
- Sejarah jabatan (official_terms): perubahan pejabat tidak menghapus data
  lama; aksi "Jabatan Baru" mengarsipkan jabatan lama otomatis
- Organization Chart interaktif: Kades -> Sekdes -> Kaur/Kasi -> Wilayah,
  BPD, Lembaga
- View public_officials (tanpa NIP/telepon) untuk website publik fase 10

Database migration: 007_government_structure

API: /api/village-profile (GET/PATCH), /api/officials (GET/POST/PATCH)

Tests: tests/phase3.test.mjs (5): profil update, sejarah jabatan, RLS
isolasi officials, view publik tanpa PII, data org chart

Known issue: foto pejabat & logo desa menunggu modul storage (fase 5)

---

## Phase 4 — Population & Family Registry

Status: SELESAI

Fitur:
- Registry penduduk lengkap: NIK, KK, gender, ttl, hubungan keluarga,
  pendidikan, pekerjaan, status perkawinan, agama, alamat RT/RW/dusun,
  status (tetap/pendatang/tidak tetap/pindah/meninggal)
- Registry keluarga (KK): no. KK, alamat, kepala keluarga auto-link,
  jumlah anggota
- Workflow status: pindah / meninggal / datang / perubahan KK, dengan
  previous_status tersimpan (data tidak hilang)
- Timeline Penduduk: semua peristiwa (terdaftar, perubahan data, pindah,
  dll) tersimpan di resident_events dan tampil di detail penduduk
- Duplicate detection: view potential_duplicate_residents (NIK sama atau
  nama serupa + tgl lahir sama via pg_trgm similarity)
- Pencarian server-side (nama/NIK, filter status), pagination, ekspor CSV
- Soft delete penduduk; audit trail create/update/delete/status change
- Index: gin_trgm_ops untuk nama, idx nik/family/village

Database migration: 008_population

API: /api/residents (GET/POST/PATCH/DELETE + status change via PATCH
eventType), /api/residents/[id] (detail + timeline + duplikat),
/api/families (GET/POST/PATCH)

Tests: tests/phase4.test.mjs (7): keluarga+KK link, NIK unique constraint,
timeline, previous_status, duplicate detection, RLS isolasi, trigram index

Known issue: import massal & foto penduduk menyusul (butuh storage fase 5)
