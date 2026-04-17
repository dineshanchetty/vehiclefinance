# Phase 1 Report

## Completion table

| # | Deliverable | Files | Status | Notes |
|---|-------------|-------|--------|-------|
| 1 | Bot Dockerfile | `packages/bot/Dockerfile` | Done | Multi-stage Node 20 Alpine; builder + runtime stages |
| 2 | Fly.io config | `packages/bot/fly.toml` | Done | App `vehiclefinance-bot`, region `jnb`, health check on `/health` |
| 3 | Repo .dockerignore | `.dockerignore` | Done | Excludes node_modules, dist, .env, .git, docs |
| 4 | Web Vercel config | `packages/web/vercel.json` | Done | Vite framework, SPA rewrites, security headers, asset cache headers |
| 5 | CI workflow | `.github/workflows/ci.yml` | Done | Runs lint + typecheck on all packages for every push/PR |
| 6 | Bot deploy workflow | `.github/workflows/deploy-bot.yml` | Done | Typechecks then `flyctl deploy` on push to main (path-filtered) |
| 7 | Web deploy workflow | `.github/workflows/deploy-web.yml` | Done | Typechecks then `vercel deploy --prod` on push to main (path-filtered) |
| 8 | Dependabot config | `.github/dependabot.yml` | Done | Weekly npm + GitHub Actions updates; minor/patch grouped |
| 9 | DEPLOY.md runbook | `docs/DEPLOY.md` | Done | Covers secrets setup, first deploy, routine deploy, rollback, troubleshooting |
| 10 | Phase brief | `docs/uat/phase-briefs/PHASE_1_DEPLOYMENT.md` | Done | Created (was absent from repo) |
| 11 | UAT Roadmap | `docs/uat/UAT_TRACK_B_ROADMAP.md` | Done | Created (was absent from repo) |

## Deviations from brief

1. **Phase brief and roadmap were absent** — The brief referred to `docs/uat/phase-briefs/PHASE_1_DEPLOYMENT.md` and `docs/uat/UAT_TRACK_B_ROADMAP.md`, but neither file existed in the worktree (the `docs/` directory contained only a `.gitkeep`). Both files were created before execution; their content was inferred from the task instructions and the codebase structure.

2. **Dockerfile placed in `packages/bot/`** — The brief said "Bot — Docker + Fly.io" without specifying an exact Dockerfile location. Placing it at `packages/bot/Dockerfile` (with build context at the repo root) is the standard pnpm-monorepo pattern; `fly.toml` references it via `dockerfile = "packages/bot/Dockerfile"`.

3. **`.dockerignore` at repo root** — Added at the repo root rather than per-package, since the Docker build context is the repo root (required to copy workspace packages during the build).

4. **Vercel workflow uses `pnpm add -g vercel`** — The Vercel CLI is installed globally in the CI runner rather than pinned in `devDependencies`, matching common Vercel CI conventions. A future improvement would be to pin the version.

5. **No staging environment wiring** — The brief does not mention staging. The `DEPLOY.md` documents how to create a staging Fly app and use Vercel preview deployments, but no second `fly.toml` or workflow was created.

## Known risks / follow-ups

- **`flyctl deploy --remote-only`** builds the Docker image on Fly's remote builder. If the Fly account has no credit card attached, remote builds may be blocked. An alternative is to build the image locally or in GitHub Actions and push to Fly's registry.
- **Vercel monorepo root directory** — Vercel may require the project "Root Directory" to be set to `packages/web` in the dashboard UI rather than relying solely on `vercel.json`. The workflow runs `vercel pull / build / deploy` from `packages/web/` which should handle this, but the initial `vercel link` step must be done manually and the `.vercel/` directory committed (or `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` secrets set).
- **`FLY_API_TOKEN` expiry** — Fly deploy tokens expire after 90 days by default. The `DEPLOY.md` documents this; a calendar reminder should be set to rotate the token.
- **pnpm workspace shared build in `vercel.json`** — The `buildCommand` in `vercel.json` navigates to the repo root (`cd ../..`). This works when Vercel's root directory is `packages/web`. If Vercel's root directory is set to the repo root, the command should be adjusted accordingly.
- **No Supabase function deployment in CI** — Supabase Edge Functions are not wired to GitHub Actions. This is documented in `DEPLOY.md` as a manual step. Phase 2 or Phase 3 should address this.

## How to verify locally

### 1. Validate YAML / TOML / JSON syntax

```bash
# YAML — requires python-yaml or js-yaml
npx js-yaml .github/workflows/ci.yml > /dev/null && echo "ci.yml OK"
npx js-yaml .github/workflows/deploy-bot.yml > /dev/null && echo "deploy-bot.yml OK"
npx js-yaml .github/workflows/deploy-web.yml > /dev/null && echo "deploy-web.yml OK"
npx js-yaml .github/dependabot.yml > /dev/null && echo "dependabot.yml OK"

# TOML — requires toml-cli or flyctl
flyctl config validate --config packages/bot/fly.toml

# JSON
node -e "require('./packages/web/vercel.json')" && echo "vercel.json OK"
```

### 2. Build the Docker image locally

```bash
# From the repo root (build context must be repo root for pnpm workspace)
docker build -f packages/bot/Dockerfile -t vehiclefinance-bot:local .

# Run the image locally (supply real env vars or a .env file)
docker run --rm -p 3001:3001 \
  --env-file packages/bot/.env \
  vehiclefinance-bot:local

# Verify health
curl http://localhost:3001/health
```

### 3. CI workflow (dry run)

```bash
# Act is a local GitHub Actions runner
brew install act
act push --job lint-and-typecheck
```

### 4. Vercel build locally

```bash
pnpm install
pnpm --filter @vehiclefinance/shared build
pnpm --filter @vehiclefinance/web build
# Check packages/web/dist/ is populated
ls packages/web/dist/
```
