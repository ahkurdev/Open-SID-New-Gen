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

## 2026-09-06 — Phase 6 (Letter Service & No-Code Workflow) SELESAI

- Migration 010_letters: letter_templates (form_schema jsonb, approval_steps
  array, sla_days), letters (status workflow, current_step, sla_due_at,
  verification_code), letter_actions (timeline), app.next_letter_number,
  app.verify_letter; seed template domisili + pengantar
- Workflow: submit -> advance (permission per step) -> approved -> sign
  (Kades + nomor otomatis) -> issued; reject + cancel dengan alasan
- Notifikasi in-app ke pemroses tahap berikutnya otomatis
- API: /api/letter-templates, /api/letters (submit + actions), /api/letters/[id],
  /api/verify-letter (publik)
- UI: /admin/surat dengan Template Builder no-code (form field editor +
  approval steps + SLA), form pengajuan dinamis dari schema, detail timeline
- Test: tests/phase6.test.mjs (7) hijau; total 41 PASS; tsc/eslint/build hijau

## 2026-09-06 — Phase 7 (Citizen Portal) SELESAI

- Migration 011_citizen_portal: users.resident_id, correction_requests
  (workflow pending/approved/rejected + RLS owner-or-village),
  residents.card_code, seed "Warga Demo Sinar Mulyo" + link akun warga
- API: /api/citizen/me, /api/citizen/corrections (submit), /api/corrections
  (review operator: approve menerapkan perubahan + resident_events +
  notifikasi ke warga)
- UI: /warga portal terpisah (data diri, KK + anggota, kartu digital
  dengan card_code, pengajuan surat, tracking status, riwayat koreksi)
- Test: tests/phase7.test.mjs (4) hijau; total 45 PASS; tsc/eslint/build hijau

## 2026-09-06 — Phase 8 (Front Office, Queue & Appointment) SELESAI

- Migration 012_front_office: service_types (4 seed layanan), appointments
  (UNIQUE slot per layanan/tanggal/jam), queue_tickets (nomor urut atomic
  per desa/hari, workflow status + counter)
- API: /api/queue (GET harian + stats, POST book/walkin, PATCH
  call/serve/finish/skip dengan validasi transisi + audit)
- UI: /admin/antrean dengan StatCard harian, daftar tiket + aksi inline,
  form walk-in, filter tanggal
- Test: tests/phase8.test.mjs (6) hijau; total 51 PASS; tsc/eslint/build hijau

## 2026-09-06 — Phase 9 (Complaint & Case Management) SELESAI

- Migration 013_complaints: complaints (ticket_no, anonim, SLA, rating,
  workflow 7 status), complaint_actions (timeline), complaint_sla
  (SLA per kategori per desa, seed 10 kategori), view overdue_complaints
- API: /api/complaints (GET + stats, POST submit, PATCH verify/assign/
  progress/resolve/close/reject/rate), /api/complaints/[id]
- UI: /admin/pengaduan dengan statistik (overdue merah), aksi inline
  sesuai status, assignment ke staff, rating pelapor
- Notifikasi ke staff saat ada pengaduan baru, ke petugas saat ditugaskan
- Test: tests/phase9.test.mjs (5) hijau; total 56 PASS; tsc/eslint/build hijau

## 2026-09-06 — Phase 10 (Public Website & Open Government) SELESAI

- Migration 014_public_website: posts (4 jenis, slug, draft/published/
  archived, scheduled_at), post_revisions, gallery_albums/gallery_photos;
  app.get_public_posts + app.get_public_stats (SECURITY DEFINER, GRANT PUBLIC)
- API: /api/posts (CMS CRUD + revisi otomatis), /api/open-data (agregat
  JSON aman), /api/public/profile (profil desa + pejabat + konten)
- UI: /admin/web CMS client; nav sidebar + palette (Antrean, Website Publik)
- Open data: total penduduk/L/P/KK, pengaduan selesai, surat terbit -
  tanpa PII sama sekali
- Test: tests/phase10.test.mjs (5) hijau; total 61 PASS; tsc/eslint/build hijau

## 2026-09-06 — Phase 11 (Government Workspace) SELESAI

- Migration 015_workspace: tasks (prioritas, recurring, parent_task_id,
  completed_at), activity_reports (dedupe UNIQUE user/date/activity),
  meetings (agenda/notulen/keputusan/peserta)
- API: /api/tasks (PATCH done -> auto-create instance recurring berikutnya),
  /api/activity-reports (rekap bulanan 12 bulan)
- UI: /admin/workspace tab Tugas + Laporan Kegiatan
- Test: tests/phase11.test.mjs (4) hijau; total 65 PASS; tsc/eslint/build hijau

## 2026-09-06 — Phase 12 (E-Musrenbang) SELESAI

- Migration 016_musrenbang: proposals (9 kategori, estimasi biaya/manfaat,
  urgency, vote_count, priority_rank, workflow 9 status), proposal_votes
  (1 user 1 vote UNIQUE), view public_proposals tanpa identitas
- API: /api/proposals (submit + 8 aksi workflow + audit), /api/proposals/vote
- UI: /admin/musrenbang (statistik, filter, aksi inline, vote, form usulan
  dengan disclaimer voting = input musyawarah)
- Test: tests/phase12.test.mjs (5) hijau; total 70 PASS; tsc/eslint/build hijau
