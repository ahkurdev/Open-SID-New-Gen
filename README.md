# Village OS — Smart Village Operating System

Platform terpadu pemerintahan, pelayanan, dan pemberdayaan desa. Multi-tenant
(kabupaten → kecamatan → desa → dusun → RW → RT), 3 area (Back Office, Portal Warga,
Website Publik), RLS-per-tenant, audit trail, workflow engine, IoT/Smart Village.

## Stack

- Next.js 15 (App Router) + TypeScript + React 19
- Tailwind CSS v4
- PostgreSQL 16 (portable, di `vendor/pgsql/`, tanpa Docker)
- Auth: sesi cookie HttpOnly + bcrypt + JWT (jose), RBAC granular
- Validation: Zod
- Migration: SQL murni di `db/migrations/`, dijalankan via `scripts/` (pg client)

## Perintah

```
npm run db:up        # start Postgres lokal (pertama kali: initdb otomatis)
npm run db:reset     # drop + recreate + migrate + seed
npm run dev          # Next.js dev server (http://localhost:3000)
npm run build        # production build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm test             # node --test tests/
```

## Struktur

```
db/migrations/     # 001_core.sql, 002_auth_rbac.sql, ... (urut, idempoten per file)
scripts/           # db-up.mjs, db-reset.mjs, migrate.mjs, seed.mjs
src/app/(backoffice)  # aplikasi aparat desa
src/app/(citizen)     # portal warga
src/app/(public)      # website publik
src/components/    # design system + komponen fitur
src/lib/           # db, auth, rbac, audit, validation
docs/              # arsitektur, ERD, RLS, deployment
tests/             # node:test — unit, permission/RLS, workflow
```

## Status

Lihat `DEVELOPMENT_PHASES.md`, `SMART_VILLAGE_PROGRESS.md`, `PROJECT_CONTEXT.md`,
`IMPLEMENTATION_LOG.md`.
