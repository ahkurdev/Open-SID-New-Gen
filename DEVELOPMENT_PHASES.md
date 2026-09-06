# DEVELOPMENT PHASES

Legend: [x] selesai & terverifikasi, [~] berjalan, [ ] belum.

[x] Phase 1 — Foundation & Design System
[x] Phase 2 — Multi-tenant, Auth, Role & Security
[x] Phase 3 — Profil & Struktur Pemerintahan Desa
[x] Phase 4 — Population & Family Registry
[x] Phase 5 — Digital Document & Archive Center
[x] Phase 6 — Letter Service & Workflow Builder
[x] Phase 7 — Citizen Portal (Super App Warga)
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

---

## Phase 5 — Digital Document & Archive Center

Status: SELESAI

Fitur:
- Upload dokumen 13 jenis (SK, Perdes, Perkades, surat masuk/keluar,
  kontrak, proposal, laporan, berita acara, foto, tanah, aset, lainnya)
- Nomor dokumen otomatis per jenis per tahun: {TIPE}/{TAHUN}/{SEQ urut}
- Storage lokal privat: vendor/storage/documents/{village_id}/{doc_id}/
  dengan whitelist MIME (PDF, gambar, Office, teks) + limit 20MB
- Version history: document_versions mencatat tiap versi + change note
- Verification code + halaman publik /verify: cek keaslian dokumen via
  fungsi SECURITY DEFINER app.verify_document (tanpa login)
- Reminder kedaluwarsa: dokumen dengan expires_at < 30 hari ditandai
- Soft delete; download via API dengan permission check + access log
- Pencarian full-text (judul/nomor/deskripsi) + filter jenis + pagination

Database migration: 009_documents (documents, document_versions,
document_categories, document_access_logs, app.next_doc_number,
app.verify_document)

API: /api/documents (GET/POST upload multipart/DELETE),
/api/documents/[id]/download, /api/verify-document (publik)

UI: /admin/dokumen (daftar + unggah + QR verification code),
/verify (halaman publik tanpa login)

Tests: tests/phase5.test.mjs (6): nomor otomatis, verifikasi QR,
version history, expiry flag, RLS isolasi, soft delete effect

Known issue: preview inline & check-in/check-out multi-user menyusul

---

## Phase 6 — Letter Service & No-Code Workflow Builder

Status: SELESAI

Fitur:
- Letter Template Builder (no-code): admin buat jenis surat baru dengan
  form schema dinamis (text/textarea/number/date/select, required flag,
  options), alur approval configurable (operator/sekdes/kades, urutan
  bebas 1-5 tahap), SLA per jenis
- Template bawaan ter-seed: Surat Keterangan Domisili, Surat Pengantar
- Workflow engine: submit -> advance per tahap (permission dicek per
  step: letter.process/approve/sign) -> approved -> sign (Kades, nomor
  surat otomatis {CODE}/{TAHUN}/{SEQ}) -> issued
- Reject dengan alasan wajib tercatat; cancel untuk pemohon/prosesor
- Timeline lengkap: semua aksi (submit/advance/reject/sign/issue/cancel)
  tersimpan di letter_actions dengan actor + timestamp + notes
- Notifikasi otomatis ke pemroses tahap berikutnya (in-app)
- Verifikasi publik surat terbit via kode (app.verify_letter SECURITY
  DEFINER, tanpa login)
- SLA tracking: sla_due_at dihitung dari template saat submit

Database migration: 010_letters (letter_templates, letters, letter_actions,
app.next_letter_number, app.verify_letter, seed 2 template)

API: /api/letter-templates (GET/POST/PATCH), /api/letters (GET/POST submit/
PATCH actions), /api/letters/[id] (detail + timeline), /api/verify-letter

UI: /admin/surat (daftar + filter status, ajukan surat dengan form dinamis
dari schema, detail + timeline + aksi sesuai status, template builder)

Tests: tests/phase6.test.mjs (7): template seed, builder schema, workflow
end-to-end submit->issue + nomor otomatis, verifikasi, reject + alasan,
SLA, RLS isolasi

Known issue: generate PDF surat & tanda tangan digital menyusul (fase lanjut)

---

## Phase 7 — Citizen Portal (Super App Warga)

Status: SELESAI

Fitur:
- Portal warga terpisah (/warga) dengan header sendiri: data diri, KK +
  anggota keluarga, pengajuan surat, riwayat koreksi
- Link akun user <-> resident (users.resident_id); akun warga demo ter-seed
- Digital Resident Card: kode unik per warga (card_code) untuk akses
  layanan; dengan disclaimer bukan pengganti KTP
- Pengajuan surat self-service: pilih template aktif, form dinamis dari
  schema template, terhubung ke resident_id pemohon
- Tracking status surat miliknya (submitted s.d. issued) dengan badge
- Koreksi data diri: kolom terbatas (telepon, pekerjaan, pendidikan,
  alamat, agama), alasan wajib, tidak bisa duplikat pending, review
  operator -> approve menerapkan perubahan + timeline event + notifikasi
  ke warga; reject dengan catatan
- RLS: warga hanya melihat koreksi miliknya; data penduduk tetap
  terisolasi per desa

Database migration: 011_citizen_portal (users.resident_id,
correction_requests, residents.card_code, seed warga demo + link)

API: /api/citizen/me (profil lengkap), /api/citizen/corrections (POST),
/api/corrections (GET list untuk operator, PATCH review)

Tests: tests/phase7.test.mjs (4): link user-resident + card_code, koreksi
approve menerapkan perubahan + timeline, RLS koreksi per user, RLS resident

Known issue: pengajuan surat warga belum pakai form schema dinamis penuh
(hanya template tanpa field custom) - menyusul penyempurnaan
