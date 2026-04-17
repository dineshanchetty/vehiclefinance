# Phase 1 — Deployment infrastructure (Worker brief)

You are the Phase 1 worker for the vehiclefinance UAT Track B roadmap.
Your job is to make the bot + web + api deployable from git, with CI/CD
and an ephemeral-branch migration verification on every PR.

## Absolute non-negotiables

- Work only on the current branch (your isolated worktree). Make clean,
  focused commits. Push the branch.
- Do **not** edit anything under `packages/api/supabase/migrations/` — that's
  Phase 0's work. If you need new migrations, put them in a Phase 2 file.
- Do **not** modify bot flows or web pages. You are infra-only.
- When you finish, write `docs/uat/phase-briefs/PHASE_1_REPORT.md` with a
  per-deliverable status table and any follow-up risks.

## Repo reminders

- Monorepo, pnpm 8.15 workspace. Root: `package.json`, `pnpm-workspace.yaml`.
- Node pinned in `.nvmrc` to 20.18.0.
- Packages:
  - `packages/bot` — Express + Claude agent (TypeScript, tsx dev, tsc build, Node runtime)
  - `packages/web` — React + Vite (static SPA)
  - `packages/api` — Supabase migrations + config (Deno test suite under `packages/api/tests/`)
  - `packages/shared` — TS types + constants
- Live Supabase project id: `sahvfsoclzgsuewbiiah`.
- Env var conventions: see `packages/bot/.env.example`, `packages/web/.env.example`,
  `packages/api/.env.example`, and root `.env.example`.

## Deliverables

### 1.1 Bot deployment: `packages/bot/Dockerfile` + `fly.toml`

- Use **Fly.io** as the target (recommended choice — cheap, simple secrets).
- `Dockerfile`: multi-stage Node 20.18-alpine build. Stage 1 installs deps
  and builds with `tsc`; stage 2 is a slim runtime image.
- `fly.toml` in `packages/bot/`: app name `vehiclefinance-bot-staging` (staging) or
  `vehiclefinance-bot` (prod). Expose the server port (3001 default; map
  to HTTPS 443). Define at least 1 VM with auto-restart. Region `jnb` (or
  `iad` if `jnb` unavailable). Mount `/app` as working dir. Healthcheck
  hitting `/health` (the existing endpoint in `src/index.ts`).
- Secrets to document in a separate `packages/bot/DEPLOY.md` (list of env
  vars from `.env.example`). Do NOT write actual secrets anywhere.

### 1.2 Web deployment: `packages/web/vercel.json`

- Target: **Vercel**.
- `vercel.json` defines:
  - `buildCommand: "pnpm --filter @vehiclefinance/web build"`
  - `installCommand: "pnpm install --frozen-lockfile"`
  - `outputDirectory: "packages/web/dist"`
  - `framework: "vite"`
- Root-level build should work (Vercel monorepo).
- Document required env vars in `packages/web/DEPLOY.md`: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`.

### 1.3 GitHub Actions CI — `.github/workflows/ci.yml`

Triggered on `pull_request` + `push` to `main`. Jobs:

- **typecheck**: `pnpm install --frozen-lockfile` then `pnpm typecheck`.
- **build**: `pnpm build`.
- **bot-tests**: run any `packages/bot/**/*.test.ts` if present (skip gracefully if none).
- **web-tests**: ditto for `packages/web`.
- **db-verify** (the key job):
  - Install Supabase CLI.
  - On PR: create a **Supabase branch** from main using
    `supabase branches create ci-${{ github.run_id }} --experimental`.
  - `supabase db push --experimental` into that branch (this applies all
    6 migration files in `packages/api/supabase/migrations/` sequentially
    against a fresh DB — this is our Phase 0 verification!).
  - Run `packages/api/tests` Deno suite against the branch using branch URL + service key.
  - Always destroy the branch on job completion (success or failure) via
    `supabase branches delete` in a post step.
  - Requires secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`.

- Use pnpm setup action (`pnpm/action-setup@v3` v8.15.0) + `actions/setup-node@v4` with `cache: pnpm`.

### 1.4 GitHub Actions CD — `.github/workflows/deploy.yml`

Triggered on `push` to `main` → staging deploy; on `push` tag `v*` → prod.

- **deploy-bot-staging**: `flyctl deploy --config packages/bot/fly.toml --app vehiclefinance-bot-staging`. Requires `FLY_API_TOKEN` secret.
- **deploy-web-staging**: `vercel deploy --prod --yes` (or use vercel Git integration and this file is a no-op).
- **deploy-migrations-staging**: `supabase db push --linked` against the staging Supabase project.
- Tag-triggered equivalents for prod.

Skip deploy if CI red. Add `needs: [typecheck, build, db-verify]` dependencies.

### 1.5 `docs/ops/DEPLOY.md`

Runbook covering:
- Which env vars each service needs (point at the `.env.example`s).
- How to rotate a secret (Fly `flyctl secrets set`, Vercel dashboard, Supabase dashboard).
- How to roll back: Fly `flyctl releases --app vehiclefinance-bot-staging` + `flyctl deploy --image <digest>`; Vercel previous deployment promote.
- How to read logs: `flyctl logs`, Vercel dashboard, `supabase logs`.
- Staging URLs (placeholders — user will fill real values).
- First-time deploy checklist.

### 1.6 Dependabot or renovate config (nice-to-have)

- `.github/dependabot.yml` for npm (weekly).

## Exit criteria (evaluator will check)

1. `Dockerfile` is multi-stage, builds without `npm install` (uses pnpm), image size <200MB.
2. `fly.toml` valid syntax; healthcheck uses `/health`; region set.
3. `vercel.json` valid JSON; framework + monorepo-aware.
4. `.github/workflows/ci.yml` runs typecheck, build, and the db-verify job that creates a Supabase branch, pushes migrations, and runs Deno tests.
5. `db-verify` job cleans up the branch in a `if: always()` step.
6. CD workflow guards on `needs: [...]` so a red PR cannot deploy.
7. `docs/ops/DEPLOY.md` covers deploy, rollback, secrets, logs.
8. Every file you create parses / is valid syntactically (YAML, TOML, JSON).
9. `PHASE_1_REPORT.md` exists with a completion table.

## Process

1. Read this brief + `docs/uat/UAT_TRACK_B_ROADMAP.md` for context.
2. Read the actual repo files you need: `packages/bot/src/index.ts` (for port + healthcheck), `packages/bot/package.json` (scripts, dependencies), `packages/web/package.json`, root `package.json`.
3. Implement each deliverable.
4. Commit in logical chunks. Push the branch.
5. Write `PHASE_1_REPORT.md`.
