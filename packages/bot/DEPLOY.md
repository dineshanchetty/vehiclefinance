# Bot deploy notes

Target: **Fly.io** (app `vehiclefinance-bot`, primary region `jnb`).

## Required secrets

Set via `flyctl secrets set KEY=value --app vehiclefinance-bot`.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`   ← service role, NEVER the anon key
- `ANTHROPIC_API_KEY`
- `DIALOG360_API_KEY`
- `DIALOG360_API_URL`
- `DIALOG360_CHANNEL_ID`
- `DIALOG360_WEBHOOK_VERIFY_TOKEN`
- `BULKSMS_TOKEN_ID`, `BULKSMS_TOKEN_SECRET`
- `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME`
- (optional) `SENDGRID_QUOTE_TEMPLATE_ID`, `SENDGRID_CONTRACT_TEMPLATE_ID`, `SENDGRID_WELCOME_TEMPLATE_ID`
- `EXTRACTION_SERVICE_URL` (points at the Supabase Edge Function)

## First-time deploy

See the full runbook at [`docs/ops/DEPLOY.md`](../../docs/ops/DEPLOY.md).

## Quick checks

- Healthcheck: `curl https://<app>.fly.dev/health`
- Logs: `flyctl logs --app vehiclefinance-bot`
- Release history: `flyctl releases --app vehiclefinance-bot`
- Rollback: `flyctl deploy --image <previous-digest>` or `flyctl releases rollback <version>`
