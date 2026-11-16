Bahasa Indonesia version: [readme.id.md](readme.id.md)

# Village OS — Smart Village Operating System

An integrated platform for village government, services, and empowerment. Multi-tenant (regency → district → village → hamlet → RW → RT), 3 areas (Back Office, Citizen Portal, Public Website), RLS-per-tenant, audit trail, workflow engine, IoT/Smart Village.

## Stack

- Next.js 15 (App Router) + TypeScript + React 19
- Tailwind CSS v4
- PostgreSQL 16 (portable, in `vendor/pgsql/`, no Docker)
- Auth: HttpOnly cookie sessions + bcrypt + JWT (jose), granular RBAC
- Validation: Zod
- Migration: plain SQL in `db/migrations/`, run via `scripts/` (pg client)

## Commands

```
npm run db:up      # start local Postgres (first time: automatic initdb)
npm run db:reset   # drop + recreate + migrate + seed
npm run dev        # Next.js dev server (http://localhost:3000)
npm run build      # production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm test           # node --test tests/
```

## Structure

```
db/migrations/      # 001_core.sql, 002_auth_rbac.sql, ... (in order, idempotent per file)
scripts/            # db-up.mjs, db-reset.mjs, migrate.mjs, seed.mjs
src/app/(backoffice)  # village official app
src/app/(citizen)     # citizen portal
src/app/(public)      # public website
src/components/     # design system + feature components
src/lib/            # db, auth, rbac, audit, validation
docs/               # architecture, ERD, RLS, deployment
tests/              # node:test — unit, permission/RLS, workflow
```

## Status

See `DEVELOPMENT_PHASES.md`, `SMART_VILLAGE_PROGRESS.md`, `PROJECT_CONTEXT.md`,
`IMPLEMENTATION_LOG.md`.
