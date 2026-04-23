# vehiclefinance

WhatsApp-based vehicle finance origination and fulfilment platform. Supabase backend, React portal, WhatsApp Cloud API integration.

## Overview

This monorepo contains all services for the vehiclefinance platform:

| Package | Description |
|---------|-------------|
| `packages/api` | Supabase Edge Functions and database migrations |
| `packages/web` | React internal portal (Vite + React + TailwindCSS) |
| `packages/bot` | WhatsApp bot handler logic (WhatsApp Cloud API) |
| `packages/shared` | Shared types, constants, and utilities |

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 9+ (workspace manager)
- Supabase CLI (required for DB migrations + UAT seed)
- Deno 1.x+ (for edge-function + integration tests)
- GitHub CLI (`gh`) (optional)

### One-command test env

```bash
scripts/setup-test-env.sh            # install + build + typecheck + test
scripts/setup-test-env.sh --with-db  # also push migrations + seed to Supabase
```

The script refuses to touch any known production Supabase project ref
(see `packages/api/scripts/uat-reset.sh`).

### Manual setup

```bash
pnpm install --frozen-lockfile
pnpm -r build
pnpm -r typecheck
pnpm --filter @vehiclefinance/web test      # 13 unit tests
deno check packages/api/tests/*.ts          # integration-test types
```

Copy each package's `.env.example` to `.env` and fill in credentials.
**Never** commit `.env`. The templates point you at a staging project ref —
do not swap it for the production ref when copying.

### UAT testing

All UAT materials live under [`docs/uat/`](docs/uat/):

- [`UAT_HANDOFF.md`](docs/uat/UAT_HANDOFF.md) — handoff package (start here)
- [`TEST_SCRIPTS.md`](docs/uat/TEST_SCRIPTS.md) — 12 scripted scenarios
- [`SIGNOFF.md`](docs/uat/SIGNOFF.md) — entry/exit criteria + severity scale
- [`DEFECTS.md`](docs/uat/DEFECTS.md) — defect logging template
- [`PARTICIPANTS.md`](docs/uat/PARTICIPANTS.md) — role assignments

Reset between UAT runs:

```bash
export SUPABASE_PROJECT_ID=<your-uat-project-ref>
packages/api/scripts/uat-reset.sh
```

## Architecture

- **WhatsApp Cloud API** — inbound/outbound messaging for borrower flows
- **Supabase** — Postgres database, auth, storage, and Edge Functions
- **React Portal** — internal tool for loan officers and ops team
- **Shared package** — TypeScript types and utilities shared across packages

## Docs

See the `docs/` directory for solution design documents.
