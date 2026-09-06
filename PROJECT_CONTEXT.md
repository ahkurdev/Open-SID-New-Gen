# PROJECT CONTEXT

## Tujuan
Village OS — Smart Village Operating System: satu platform untuk pemerintahan desa,
pelayanan warga, pembangunan, ekonomi lokal, GIS/Digital Twin, IoT, AI copilot.
Bukan clone OpenSID. Master spec: 25 fase + tambahan Smart Village (lihat percakapan
inisiasi / DEVELOPMENT_PHASES.md).

## Keputusan Penting (jangan diubah tanpa instruksi)

1. **Tanpa Docker** — instruksi eksplisit user. Postgres 16 portable binaries di
   `vendor/pgsql/`, dijalankan sebagai proses lokal user via `npm run db:up`.
   Data dir: `vendor/pgdata/`. Port: 54329 (hindari bentrok; BUKAN 20128 — port itu
   haram diganggu di dev box ini).
2. **Tanpa Supabase hosted** — tidak ada kredensial cloud. Arsitektur tetap
   "Supabase-style": PostgreSQL + RLS + Auth + Storage lokal. RLS tetap diaktifkan dan
   ditest — keamanan tenant isolation ada di database, bukan hanya di aplikasi.
3. **Auth**: sesi cookie HttpOnly (JWT via jose, 7 hari, rotasi), password bcrypt
   (cost 12), RBAC granular (role → permissions, custom role didukung), lockout
   setelah 5 gagal, login activity + audit trail append-only.
4. **Multi-tenant**: semua tabel domain punya `village_id NOT NULL REFERENCES
   villages(id)`. RLS policy `village_id = current_village_id()` dari JWT claim.
   Super admin platform bypass via claim `is_platform_admin`.
5. **3 area terpisah**: `/admin/*` back office, `/warga/*` portal warga, `/` website
   publik. Tidak dicampur.
6. **Bahasa UI**: Indonesia. Kode/identifier: Inggris.
7. **UI**: Tailwind v4, light theme default, dark mode, tanpa emoji, tanpa neon/glow.
   Aksen brand: teal/emerald. Komponen di `src/components/ui/`.
8. **Migration**: SQL murni, urut nama file, dijalankan `scripts/migrate.mjs` (idempoten
   via tabel `_migrations`).
9. **Test**: `node --test` di `tests/`. Wajib hijau sebelum fase dinyatakan selesai.
10. **Node 24**, npm. Windows dev box, shell bash (MSYS).

## Konvensi

- Server Components default; `"use client"` hanya untuk interaktivitas.
- API routes: `src/app/api/*/route.ts`, semua POST/PUT/DELETE wajib cek permission
  server-side + Zod validate + audit log.
- Soft delete: kolom `deleted_at` untuk tabel utama.
- Semua tabel: `id uuid default gen_random_uuid()`, `created_at`, `updated_at`,
  `created_by`, `updated_by` (nullable untuk system).
- Nama tabel singular? TIDAK — plural (villages, residents, letters, ...).
- Error handling: helper `ok()`/`fail()` di `src/lib/api.ts`.

## Status Saat Ini

- Fase aktif: Phase 14 (Procurement)
- Fase selesai: 1-13
- Total test: 75 PASS (14 file test, idempotent)
- Progress: `DEVELOPMENT_PHASES.md`

## Catatan Teknis Penting

- psql RETURNING dengan function call tidak dievaluasi inline di PG16; panggil fungsi dulu
- Halaman publik tanpa auth: /verify (dokumen), verify-letter API
- Permission mapping workflow surat: operator=letter.process, sekdes=letter.approve, kades=letter.sign
- Storage file: vendor/storage/documents/{village_id}/{doc_id}/v{N}_{filename}
- vendor/ wajib di .gitignore (binary pgAdmin 191MB ditolak GitHub)
