# Deployment Runbook

This document covers how to configure secrets, trigger deploys, and roll back for the
vehiclefinance platform.

---

## Architecture overview

| Service | Platform | Config file |
|---------|----------|-------------|
| Bot (Express/WhatsApp) | Fly.io | `packages/bot/fly.toml` |
| Web portal (React/Vite) | Vercel | `packages/web/vercel.json` |
| API (Supabase Edge Functions) | Supabase | `packages/api/supabase/` |

---

## Prerequisites

```bash
# Fly.io CLI
curl -L https://fly.io/install.sh | sh

# Vercel CLI
npm i -g vercel

# Supabase CLI
npm i -g supabase

# GitHub CLI (for secret management)
brew install gh
```

---

## 1. Bot — Fly.io

### Initial setup (first deployment)

```bash
# Authenticate
flyctl auth login

# Create the app (once per environment)
flyctl apps create vehiclefinance-bot --org <your-org>

# Set secrets — replace placeholder values with real credentials
flyctl secrets set \
  NODE_ENV=production \
  PORT=3001 \
  ANTHROPIC_API_KEY=<your-anthropic-key> \
  DIALOG360_API_KEY=<your-dialog360-key> \
  DIALOG360_API_URL=https://waba.360dialog.io/v1 \
  DIALOG360_CHANNEL_ID=<your-channel-id> \
  DIALOG360_WEBHOOK_VERIFY_TOKEN=<random-token> \
  BULKSMS_TOKEN_ID=<your-bulksms-token-id> \
  BULKSMS_TOKEN_SECRET=<your-bulksms-token-secret> \
  SENDGRID_API_KEY=<your-sendgrid-key> \
  SENDGRID_FROM_EMAIL=noreply@vehiclefinance.co.za \
  SENDGRID_FROM_NAME="Vehicle Finance" \
  SUPABASE_URL=<your-supabase-url> \
  SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key> \
  EXTRACTION_SERVICE_URL=<your-extraction-url> \
  --app vehiclefinance-bot

# First deploy
flyctl deploy --config packages/bot/fly.toml
```

### Set the GitHub Actions secret

In your GitHub repository settings → Secrets and variables → Actions:

| Secret name | Value |
|-------------|-------|
| `FLY_API_TOKEN` | Output of `flyctl tokens create deploy -a vehiclefinance-bot` |

### Routine deployment (CI/CD)

Deploying is automatic — push to `main` with changes under `packages/bot/` or `packages/shared/`.

To deploy manually:

```bash
flyctl deploy --config packages/bot/fly.toml --remote-only
```

### View logs

```bash
flyctl logs --app vehiclefinance-bot
```

### Health check

```bash
curl https://vehiclefinance-bot.fly.dev/health
```

### Rollback

```bash
# List releases
flyctl releases --app vehiclefinance-bot

# Roll back to a specific version (e.g. v12)
flyctl deploy --image registry.fly.io/vehiclefinance-bot:v12 --app vehiclefinance-bot
```

### Scale

```bash
# Scale to 2 machines
flyctl scale count 2 --app vehiclefinance-bot

# Check machine status
flyctl status --app vehiclefinance-bot
```

---

## 2. Web Portal — Vercel

### Initial setup (first deployment)

```bash
# Authenticate
vercel login

# Link the project (run from packages/web/)
cd packages/web
vercel link

# Set environment variables in Vercel dashboard or via CLI:
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
```

### Set the GitHub Actions secrets

In your GitHub repository settings → Secrets and variables → Actions:

| Secret name | Value |
|-------------|-------|
| `VERCEL_TOKEN` | Personal access token from https://vercel.com/account/tokens |
| `VERCEL_ORG_ID` | From `packages/web/.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | From `packages/web/.vercel/project.json` after `vercel link` |

### Routine deployment (CI/CD)

Deploying is automatic — push to `main` with changes under `packages/web/` or `packages/shared/`.

To deploy manually:

```bash
cd packages/web
vercel deploy --prod
```

### Rollback

In the Vercel dashboard → Deployments → select the target deployment → "Promote to Production".

Or via CLI:

```bash
# List recent deployments
vercel ls --app vehiclefinance-web

# Promote a specific deployment to production
vercel promote <deployment-url>
```

---

## 3. Supabase Edge Functions

Edge Functions are deployed separately (not handled by Phase 1 CI/CD).

```bash
cd packages/api

# Deploy all functions
supabase functions deploy --project-ref <your-project-ref>

# Deploy a single function
supabase functions deploy webhook-dialog360 --project-ref <your-project-ref>
```

---

## 4. Local development

```bash
# Install all dependencies
pnpm install

# Start bot in watch mode
pnpm --filter @vehiclefinance/bot dev

# Start web portal
pnpm --filter @vehiclefinance/web dev

# Build everything
pnpm build
```

---

## 5. Secrets reference

All secrets use placeholder names in CI config. Never commit real values.

### Bot secrets (Fly.io + GitHub Actions)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `DIALOG360_API_KEY` | Dialog360 partner API key |
| `DIALOG360_API_URL` | Dialog360 base URL |
| `DIALOG360_CHANNEL_ID` | Dialog360 channel identifier |
| `DIALOG360_WEBHOOK_VERIFY_TOKEN` | Random token for webhook verification |
| `BULKSMS_TOKEN_ID` | BulkSMS token ID |
| `BULKSMS_TOKEN_SECRET` | BulkSMS token secret |
| `SENDGRID_API_KEY` | SendGrid API key |
| `SENDGRID_FROM_EMAIL` | Verified sender address |
| `SENDGRID_FROM_NAME` | Sender display name |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (bypasses RLS) |
| `EXTRACTION_SERVICE_URL` | Document extraction function URL |
| `FLY_API_TOKEN` | Fly.io deploy token (GitHub Actions only) |

### Web secrets (Vercel + GitHub Actions)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL (public) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (public, safe to expose) |
| `VERCEL_TOKEN` | Vercel personal access token (GitHub Actions only) |
| `VERCEL_ORG_ID` | Vercel organisation ID (GitHub Actions only) |
| `VERCEL_PROJECT_ID` | Vercel project ID (GitHub Actions only) |

---

## 6. Environments

| Environment | Bot URL | Web URL |
|-------------|---------|---------|
| Production | `https://vehiclefinance-bot.fly.dev` | Configured in Vercel project |
| Staging | Create a second Fly app `vehiclefinance-bot-staging` | Vercel preview deployments |

---

## 7. Troubleshooting

### Bot not responding to webhooks

1. Check the bot health: `curl https://vehiclefinance-bot.fly.dev/health`
2. Check Fly logs: `flyctl logs --app vehiclefinance-bot`
3. Verify the Dialog360 webhook URL points to `https://vehiclefinance-bot.fly.dev/webhook/dialog360`
4. Verify `DIALOG360_WEBHOOK_VERIFY_TOKEN` matches the value set in Dialog360 channel settings.

### Web portal shows blank page

1. Check the browser console for errors.
2. Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Vercel.
3. Check Vercel deployment logs in the dashboard.

### CI/CD workflow fails

1. Check GitHub Actions logs for the failing step.
2. Verify all required secrets are set in repository settings.
3. For bot deploys: ensure `FLY_API_TOKEN` has not expired (tokens expire after 90 days by default).
