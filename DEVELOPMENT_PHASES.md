# DEVELOPMENT PHASES

Legend: [x] selesai & terverifikasi, [~] berjalan, [ ] belum.

[x] Phase 1 — Foundation & Design System
[x] Phase 2 — Multi-tenant, Auth, Role & Security
[x] Phase 3 — Profil & Struktur Pemerintahan Desa
[x] Phase 4 — Population & Family Registry
[x] Phase 5 — Digital Document & Archive Center
[x] Phase 6 — Letter Service & Workflow Builder
[x] Phase 7 — Citizen Portal (Super App Warga)
[x] Phase 8 — Front Office, Queue & Appointment
[x] Phase 9 — Complaint & Case Management
[x] Phase 10 — Public Website & Open Government
[x] Phase 11 — Government Workspace
[x] Phase 12 — Participatory Planning (E-Musrenbang)
[x] Phase 13 — Finance & Budget Intelligence
[x] Phase 14 — Procurement, Contract & Vendor
[x] Phase 15 — Asset, Inventory & Infrastructure
[x] Phase 16 — Social Aid & Welfare Intelligence
[x] Phase 17 — GIS & Village Digital Twin
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

---

## Phase 8 — Front Office, Queue & Appointment

Status: SELESAI

Fitur:
- Service types: kategori layanan front office dengan estimasi durasi
  (avg_minutes), ter-seed 4 layanan default
- Appointment booking: pilih layanan + tanggal + slot; slot duplikat
  ditolak via UNIQUE constraint; status booked/checked_in/served/no_show/
  cancelled
- Digital queue (walk-in): tiket nomor urut otomatis per desa per hari
  (atomic MAX+1), status workflow waiting -> called -> serving -> served
  (atau skipped)
- Counter management: loket dicatat saat panggil/layani
- Dashboard antrean harian: total tiket, aktif, selesai, rata-rata durasi
  layanan (menit), filter per tanggal
- Aksi petugas: Panggil / Layani / Selesai / Lewati dengan validasi
  transisi status + audit trail

Database migration: 012_front_office (service_types, appointments,
queue_tickets + seed layanan)

API: /api/queue (GET dashboard harian, POST mode=book|walkin,
PATCH aksi tiket)

UI: /admin/antrean (statistik + daftar antrean + aksi inline + walk-in)

Tests: tests/phase8.test.mjs (6): seed layanan, booking + slot duplikat,
tiket urut, workflow status, statistik harian, RLS isolasi

Known issue: display layar antrean (kiosk/TV) & QR check-in menyusul
(fase kiosk/field mode)

---

## Phase 9 — Complaint & Case Management

Status: SELESAI

Fitur:
- Pengaduan 10 kategori (jalan, sampah, pelayanan, bantuan, keamanan,
  fasilitas, lampu, banjir, administrasi, lainnya)
- Ticket number otomatis TKT/{TAHUN}/{SEQ} per desa
- Pengaduan anonim: identitas disamar (nama samaran), flag is_anonymous
- SLA per kategori konfigurabel per desa (complaint_sla); sla_due_at
  dihitung saat submit; view overdue_complaints + badge "SLA" di UI
- Workflow lengkap: new -> verified -> assigned -> in_progress -> resolved
  -> closed (atau rejected); validasi transisi status
- Assignment ke petugas (dari daftar staff desa) + notifikasi in-app
- Rating kepuasan pelapor 1-5 setelah resolved (hanya pelapor)
- Timeline semua aksi + catatan; statistik dashboard (total/aktif/selesai/
  overdue)
- Audit trail semua aksi; RLS isolasi per desa

Database migration: 013_complaints (complaints, complaint_actions,
complaint_sla + seed 10 kategori, view overdue_complaints)

API: /api/complaints (GET/POST/PATCH dengan 7 aksi), /api/complaints/[id]
(detail + timeline + daftar staff)

UI: /admin/pengaduan (statistik, filter status, detail + timeline + aksi
sesuai status, form catat pengaduan dengan opsi anonim)

Tests: tests/phase9.test.mjs (5): SLA seed, submit anonim + ticket,
workflow lengkap + rating, overdue view, RLS isolasi

Known issue: upload foto before/after & GPS picker map menyusul (fase GIS)

---

## Phase 10 — Public Website & Open Government

Status: SELESAI

Fitur:
- CMS konten publik: berita, artikel, pengumuman, agenda dengan
  draft/publish/archived + slug otomatis unik per desa
- Post revisions: setiap edit konten tersimpan sebagai revisi
- Fungsi publik SECURITY DEFINER: app.get_public_posts (hanya published,
  terjadwal), app.get_public_stats (agregat tanpa PII: total penduduk,
  L/P, KK, pengaduan selesai, surat terbit)
- Open Data API: /api/open-data (JSON agregat aman), /api/public/profile
  (profil desa + pejabat aktif via view tanpa PII + konten terbit)
- Transparansi Center: statistik desa terbuka tanpa membocorkan data
  pribadi (nama/NIK/alamat tidak pernah keluar)
- UI admin: /admin/web untuk kelola konten (tulis, terbitkan, arsipkan,
  hapus) dengan permission public.publish

Database migration: 014_public_website (posts, post_revisions,
gallery_albums, gallery_photos, app.get_public_posts, app.get_public_stats)

API: /api/posts (CRUD CMS), /api/open-data, /api/public/profile (publik)

Tests: tests/phase10.test.mjs (5): slug otomatis, draft tak tampil publik,
stats agregat tanpa PII, revisi tercatat, RLS isolasi

Known issue: galeri foto UI & jadwal publish (scheduled_at) menyusul

---

## Phase 11 — Government Workspace

Status: SELESAI

Fitur:
- Task management: buat/tugaskan/complete tugas dengan prioritas
  (low/normal/high/urgent), deadline, overdue marker, notifikasi ke PIC
- Recurring task: harian/mingguan/bulanan - saat selesai, instance
  berikutnya dibuat otomatis dengan due date bergeser
- Laporan Kegiatan Harian: petugas catat kegiatan, lokasi, deskripsi,
  output, durasi jam; dedupe per user/tanggal/aktivitas
- Rekap bulanan otomatis: total kegiatan, total jam, jumlah petugas
  aktif per bulan (12 bulan terakhir)
- Tabel meetings (agenda, notulen, keputusan, peserta) tersedia untuk
  notulen rapat fase lanjut

Database migration: 015_workspace (tasks, activity_reports, meetings)

API: /api/tasks (GET + stats, POST, PATCH dengan auto-recurring),
/api/activity-reports (GET + rekap bulanan, POST)

UI: /admin/workspace tab Tugas (statistik + daftar + complete) dan
Laporan Kegiatan (daftar + rekap bulanan + form input)

Tests: tests/phase11.test.mjs (4): task + assign + notifikasi, recurring
instance, laporan + rekap bulanan, RLS isolasi

Known issue: checklist subtask UI & disposisi surat menyusul

---

## Phase 12 — Participatory Planning (E-Musrenbang)

Status: SELESAI

Fitur:
- Usulan pembangunan warga: 9 kategori (jalan, drainase, jembatan,
  lampu, pendidikan, ekonomi, fasilitas umum, kesehatan, lainnya)
  dengan lokasi, estimasi biaya, estimasi penerima manfaat, urgensi
- Nomor usulan otomatis MUS/{TAHUN}/{SEQ} per desa per tahun
- Usulan anonim didukung; view public_proposals tanpa identitas
  pengusul untuk transparansi
- Voting dukungan warga: 1 user 1 suara per usulan (UNIQUE), tampil
  sebagai "input musyawarah" - bukan penentu otomatis keputusan
- Workflow lengkap: submitted -> verified -> in_musrenbang ->
  prioritized (dengan rank) -> approved -> planned -> in_progress ->
  completed (atau rejected dengan alasan)
- Progres publik bisa dilihat lewat status usulan

Database migration: 016_musrenbang (proposals, proposal_votes,
view public_proposals)

API: /api/proposals (GET/POST/PATCH 8 aksi), /api/proposals/vote

UI: /admin/musrenbang (statistik, filter status, aksi inline per status,
vote button, form usulan dengan opsi anonim + disclaimer voting)

Tests: tests/phase12.test.mjs (5): nomor otomatis, vote 1x1 + duplikat
ditolak, workflow 7 transisi, view publik tanpa identitas, RLS isolasi

Known issue: peta lokasi usulan menyusul (fase GIS)

---

## Phase 13 — Finance & Budget Intelligence

Status: SELESAI

Fitur:
- Budget planning per tahun: pos pendapatan/belanja/pembiayaan dengan
  upsert (UNIQUE village+year+category+name)
- Transaksi pemasukan/pengeluaran terhubung ke pos anggaran
- Realisasi per pos: planned vs realized dengan progress bar + burn rate
  belanja keseluruhan
- Tren bulanan: pemasukan/pengeluaran per bulan (bar visual)
- Budget Anomaly Detector (warning saja, keputusan tetap manusia):
  - flag "duplikat": amount + deskripsi sama dalam 30 hari
  - flag "lonjakan": amount > 5x rata-rata 90 hari (min 5 transaksi)
  - flag tersimpan di transaksi + panel anomali terpisah
- Disclaimer: bukan pengganti sistem resmi pemerintah

Database migration: 017_finance (budget_plans, finance_transactions,
app.detect_finance_anomaly)

API: /api/finance (GET dashboard tahunan, POST mode=plan|transaction)

UI: /admin/keuangan (StatCard pemasukan/pengeluaran/burn rate/anomali,
anggaran vs realisasi dengan bar, tren bulanan, panel anomali, form
transaksi + pos anggaran)

Tests: tests/phase13.test.mjs (5): budget upsert, anomaly duplikat,
anomaly lonjakan, realisasi terhitung, RLS isolasi

Known issue: import ekstrak Siskeudes & lampiran dokumen transaksi menyusul

---

## Phase 14 — Procurement, Contract & Vendor

Status: SELESAI

Fitur:
- Vendor registry: kontak, NPWP, rekening, performance score 0-5,
  blacklist flag, nama UNIQUE per desa
- Purchase Order: nomor otomatis PO/{TAHUN}/{SEQ}, workflow open ->
  delivered -> completed (atau cancelled), terhubung vendor
- Kontrak: nomor otomatis KTR/{TAHUN}/{SEQ}, periode start/end, view
  expiring_contracts (aktif <= 30 hari ke depan) untuk reminder
- Invoice: nomor otomatis INV/{TAHUN}/{SEQ}, dibuat dari PO, status
  unpaid/paid (paid_at otomatis), overdue flag saat lewat jatuh tempo
- Vendor quotes: kumpulkan penawaran per permintaan pengadaan
- Statistik: PO aktif, kontrak aktif, invoice belum bayar

Database migration: 018_procurement (vendors, procurement_requests,
vendor_quotes, purchase_orders, contracts, invoices, expiring_contracts
view, RLS dinamis via DO block)

API: /api/procurement (GET semua, POST mode=vendor|quote|po|contract|
invoice, PATCH status per kind)

UI: /admin/pengadaan tab PO/Kontrak/Invoice/Vendor dengan aksi status
inline + form masing-masing

Tests: tests/phase14.test.mjs (5): vendor + duplikat, PO + nomor,
kontrak + expiring view, invoice + paid + overdue, RLS isolasi

Known issue: perbandingan quotation UI & vendor performance history
menyusul penyempurnaan

---

## Phase 15 — Asset, Inventory & Infrastructure

Status: SELESAI

Fitur:
- Daftar aset 11 kategori (tanah, bangunan, kendaraan, peralatan, mesin,
  jalan, jembatan, drainase, lampu, fasilitas umum, lainnya) dengan kode
  otomatis AST/{KAT}/{SEQ} per desa
- QR asset tag: kode unik dicetak/ditempel di aset; scan via
  app.lookup_asset_public (SECURITY DEFINER, data minimal tanpa auth)
- Kondisi: baik/rusak_ringan/rusak_berat dengan update manual
- Maintenance: jadwal rutin/perbaikan/penggantian dengan biaya, status
  scheduled->done, total biaya maintenance per aset
- Mutasi/peminjaman/penghapusan: asset_transfers + perubahan status aset
  (aktif/dipinjam/perbaikan/dihapus)
- Statistik: total aset, rusak ringan/berat, total nilai aset
- Penanggung jawab (custodian) per aset

Database migration: 019_assets (assets, asset_maintenance, asset_transfers,
app.next_asset_code, app.lookup_asset_public) + 020_assets_rls_fix
(RLS assets terlewat di 019)

API: /api/assets (GET/POST mode=asset|maintenance|transfer, PATCH kondisi
+ selesaikan maintenance), /api/assets/lookup (publik scan QR)

UI: /admin/aset (statistik, filter kategori + search, QR tag modal,
form aset/maintenance/mutasi, scanner publik di halaman)

Tests: tests/phase15.test.mjs (5): kode otomatis, maintenance + biaya,
mutasi + status, QR lookup publik, RLS isolasi

Known issue: stock opname bulk & foto aset menyusul (butuh uploader reuse)

---

## Phase 16 — Social Aid & Welfare Intelligence

Status: SELESAI

Fitur:
- Program bantuan: 5 sumber dana (desa/kabupaten/provinsi/pusat/donatur),
  periode, kuota, kriteria (jsonb), status active/closed
- Workflow penerima: candidate -> verified -> accepted -> distributed,
  dengan reject (alasan) di tahap awal
- Tidak diambil bantuan: status not_claimed dengan 6 alasan terstruktur
  (pindah/meninggal/menolak/tidak_ditemukan/tidak_memenuhi_syarat/lainnya)
  - data TIDAK dihapus, jejak tersimpan
- Welfare Insight (explainable): app.welfare_insight_candidates menghitung
  skor transparan dari indikator kesejahteraan (lansia x2, disabilitas x3,
  single parent x3, tanpa penghasilan x4, balita x1) + faktor ditampilkan
  per kandidat + disclaimer wajib verifikasi petugas. BUKAN penetapan resmi.
- Statistik per program: diterima vs kuota, disalurkan

Database migration: 021_social_aid (aid_programs, aid_recipients,
residents.welfare_indicators, app.welfare_insight_candidates, RLS)

API: /api/aid (GET program+recipients, POST program/recipient, PATCH
verify/accept/reject/distribute/mark_not_claimed dengan validasi transisi),
/api/aid/insight (kandidat rekomendasi + disclaimer)

UI: /admin/bantuan (kartu program, tabel penerima dengan aksi inline,
modal rekomendasi explainable dengan skor + faktor)

Tests: tests/phase16.test.mjs (5): program, workflow status, not_claimed
data tetap ada, insight skor 9 + faktor transparan + disclaimer, RLS

Known issue: foto dokumentasi distribusi menyusul (butuh uploader reuse);
indikator kesejahteraan diisi manual saat pendataan

---

## Phase 17 — GIS & Village Digital Twin

Status: SELESAI (data layer + API + UI list; peta visual Leaflet interaktif
menyusul sebagai penyempurnaan UI - data GeoJSON sudah siap konsumsi)

Fitur:
- Objek geospasial 8 jenis (jalan, fasilitas, rumah, lahan, air, batas,
  titik_rawan, lainnya) dengan GeoJSON geometry (Point/LineString/Polygon)
  dan properties bebas (kondisi, panjang, foto, dll)
- Link ke aset (linked_asset_id) dan proposal musrenbang
  (linked_proposal_id) - digital twin entity terhubung ke modul lain
- Insiden lapangan 6 jenis (banjir, longsor, kebakaran, pohon_tumbang,
  jalan_rusak, lainnya) dengan severity 4 tingkat
- Workflow insiden: reported -> verified -> assigned -> responding ->
  resolved -> post_report dengan note evaluasi
- GeoJSON FeatureCollection publik via app.gis_features_public
  (SECURITY DEFINER, tanpa data pribadi) untuk peta publik

Database migration: 022_gis (gis_objects, gis_incidents,
app.gis_features_public, RLS keduanya)

API: /api/gis (GET objek+insiden, POST object/incident, PATCH workflow
insiden dengan validasi transisi), /api/gis/public (GeoJSON publik
tanpa login via villageId)

UI: /admin/gis (daftar objek dengan filter jenis, panel insiden aktif
dengan aksi workflow inline, 2 form modal koordinat)

Tests: tests/phase17.test.mjs (4): geometry GeoJSON, workflow insiden
lengkap, FeatureCollection publik tanpa data pribadi, RLS

Known issue: peta visual interaktif (Leaflet/MapLibre) & foto before/after
insiden menyusul; endpoint GeoJSON publik sudah siap dikonsumsi renderer
