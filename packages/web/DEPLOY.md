# Web deploy notes

Target: **Vercel** (monorepo — the canonical `vercel.json` lives at the repo root).

## Required env vars (Vercel Project → Settings → Environment Variables)

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon (publishable) key. **Never** the service role key.
- (optional) `VITE_API_BASE_URL` — if the bot exposes an internal API the web calls directly.

## Vercel project settings

- **Framework preset:** Vite
- **Root Directory:** repo root (`.`) — the monorepo `vercel.json` at the root tells Vercel how to build the `packages/web` subpackage.
- **Build Command:** `pnpm --filter @vehiclefinance/shared build && pnpm --filter @vehiclefinance/web build` (from `vercel.json`)
- **Output Directory:** `packages/web/dist` (from `vercel.json`)
- **Install Command:** `pnpm install --frozen-lockfile` (from `vercel.json`)

## First-time deploy

See [`docs/ops/DEPLOY.md`](../../docs/ops/DEPLOY.md).

## Rollback

Vercel dashboard → Project → Deployments → select a previous green deployment → **Promote to Production**.
