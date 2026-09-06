# IMPLEMENTATION LOG

## 2026-09-06 — Phase 1 (Foundation) SELESAI

- Scaffold Next.js 15.5 (App Router, TS strict, Tailwind v4, src dir, alias @/*)
- Keputusan: tanpa Docker (instruksi user); Postgres 16.9 portable di vendor/pgsql,
  port 54329, proses user via scripts/db-up.mjs (initdb otomatis)
- Keputusan: tanpa Supabase hosted (tidak ada kredensial cloud) — pola tetap
  PostgreSQL + RLS; auth pakai sesi cookie JWT (jose) + bcrypt cost 12
- Migration: 001_core (regions/villages/users/roles/user_roles/sessions/
  login_activities/audit_logs/notifications + helper RLS + role app non-superuser),
  002_auth_functions (SECURITY DEFINER untuk login), 003_password_reset,
  004_lockout_fix (success login mengembalikan status locked -> active)
- Design system: Button, Input/Textarea/Select/Label, Card, Badge, Modal,
  ConfirmDialog, Toast, Skeleton, EmptyState/ErrorState, CommandPalette (Ctrl+K),
  DataTable, PageHeader, StatCard, Sidebar, Breadcrumb, ThemeToggle
- Halaman: /, /login, /forgot-password, /reset-password, /admin (dashboard),
  /admin/profile, /admin/settings, /403, not-found 404, error 500, /onboarding
- Middleware auth guard untuk /admin /warga /onboarding
- API: /api/health, /api/profile (GET/PATCH/PUT), /api/users (GET/POST/PATCH),
  /api/roles (GET/POST/PATCH), /api/notifications (GET/PATCH)
- Seed: desa Sinar Mulyo + 7 akun demo (admin/operator/sekdes/kades/bendahara/
  auditor/warga), password Password123!
- Test: tests/phase1.test.mjs (7: migration, seed, RLS no-claims, RLS tenant read,
  tenant isolation, audit append-only, login fn) + tests/auth.test.mjs (3: bcrypt,
  session+JWT+revoke, lockout 5x)
- Gate: tsc clean, eslint clean, next build sukses, dev server health OK
- Bug ditemukan & diperbaiki: lockout tidak reset status locked saat login sukses
  (004_lockout_fix.sql); eslint-config-next butuh .js suffix / FlatCompat

## 2026-09-06 — Phase 2 (Multi-tenant, Auth, Role & Security) SELESAI

- Migration 005_invitations (undangan + accept_invitation/peek_invitation SECURITY
  DEFINER, email_verified_at), 006_rate_limit (rate_limit_hit sliding window)
- API baru: /api/invitations (POST/GET/DELETE + accept), /api/sessions
  (GET/DELETE revoke satu/semua lain), /api/users/[id]/activity,
  /api/villages (platform admin), /api/roles, /api/users
- UI: tab Pengguna/Role/Undangan di /admin/pengguna; SessionsClient di profile;
  halaman /accept-invite
- Keamanan: rate limit login (10/5 menit per email+IP) & forgot (5/jam),
  deteksi IP baru -> notifikasi keamanan, undangan token hash SHA-256
- Seed: desa kedua Sukamaju (34.01.10.2005) untuk isolasi
- Test: tests/phase2.test.mjs (6) hijau; tsc/eslint/build hijau
- Fix: forgotPasswordAction dipindah ke password-actions.ts (auth-actions tidak
  boleh ekspor non-async seal "use server" campuran)

## 2026-09-06 — Phase 3 (Profil & Struktur Pemerintahan Desa) SELESAI

- Migration 007_government_structure: kolom profil desa (vision/mission/history/
  area_km2), tabel officials (4 kategori) + official_terms (sejarah jabatan),
  view public_officials tanpa PII untuk publik
- API: /api/village-profile (GET/PATCH, permission settings.manage + audit),
  /api/officials (GET/POST/PATCH; PATCH newTerm mengarsipkan jabatan lama)
- UI: /admin/profil tab Profil Desa / Perangkat & Lembaga / Bagan Organisasi
  (OrgChart: Kades -> Sekdes -> Kaur/Kasi, Wilayah, BPD, Lembaga)
- Sidebar + command palette: tambah nav Profil Desa
- Test: tests/phase3.test.mjs (5) hijau; tsc/eslint/build hijau; 21 PASS total

## 2026-09-06 — Phase 4 (Population & Family Registry) SELESAI

- Migration 008_population: families (KK, head_resident_id), residents
  (NIK unique, status workflow, soft delete), resident_events (timeline),
  view potential_duplicate_residents (pg_trgm similarity > 0.75 + NIK sama)
- API: /api/residents (CRUD + status change + audit), /api/residents/[id]
  (detail + timeline + duplikat), /api/families (CRUD)
- UI: /admin/penduduk tab Penduduk/Keluarga; server-side search + filter
  status + pagination; detail modal dengan timeline + tombol ubah status
  (pindah/meninggal/pendatang/kembali tetap); ekspor CSV per halaman
- Dashboard: StatCard total penduduk nyata dari DB
- Test: tests/phase4.test.mjs (7, idempotent) hijau; total 28 PASS;
  tsc/eslint/build hijau

## 2026-09-06 — Phase 5 (Digital Document & Archive Center) SELESAI

- Migration 009_documents: documents (13 jenis, doc_number, verification_code,
  expires_at, soft delete), document_versions, document_categories,
  document_access_logs; fungsi app.next_doc_number + app.verify_document
  (SECURITY DEFINER, GRANT PUBLIC utk verifikasi tanpa login)
- Storage lokal privat vendor/storage/documents/{village}/{doc}/; whitelist
  MIME + max 20MB; download via API dengan permission + access log
- API: /api/documents (multipart upload), /api/documents/[id]/download,
  /api/verify-document (publik)
- UI: /admin/dokumen (upload, daftar, filter, QR code tampil), /verify
  (halaman publik cek keaslian dokumen)
- Nav sidebar + palette: Arsip Dokumen; landing page: link Verifikasi
- Test: tests/phase5.test.mjs (6, idempotent) hijau; total 34 PASS;
  tsc/eslint/build hijau
- Catatan: psql 16.9 - RETURNING expression dengan function call tidak
  dievaluasi inline; pattern: panggil fungsi dulu lalu pakai hasilnya
