# Edge function deploy — bot port

The Node/Express bot in `packages/bot/` has been ported to three Supabase
Edge Functions. Once deployed, the local bot + ngrok tunnel are no longer
required — Dialog360 posts directly to the Supabase URLs.

## Functions

| Function                    | Replaces                                | Notes                                   |
|-----------------------------|-----------------------------------------|-----------------------------------------|
| `dialog360-webhook`         | POST + GET `/webhook/dialog360`         | Inbound WhatsApp → agent loop. **No JWT.** |
| `dialog360-status-webhook`  | POST `/webhook/status`                  | Delivery status receipts. **No JWT.**    |
| `ops-api`                   | POST `/api/ops-send-message`, `/api/notify-seller`, `/api/send-quote`, `/api/send-contract`, `/api/send-notification` | Single function, route on URL last segment. JWT verification on. |

## Required secrets

Set once with `supabase secrets set` (project ref `sahvfsoclzgsuewbiiah`):

```
ANTHROPIC_API_KEY
DIALOG360_API_KEY
DIALOG360_API_URL                      # e.g. https://waba-v2.360dialog.io
DIALOG360_WEBHOOK_VERIFY_TOKEN
SUPABASE_URL                           # auto-injected — but listed here for clarity
SUPABASE_SERVICE_ROLE_KEY              # auto-injected
MINDEE_API_KEY
MINDEE_MODEL_ID_DOC
MINDEE_MODEL_POA
MINDEE_MODEL_BS
MINDEE_WEBHOOK_IDS                     # optional, see extract-document docs
WHATSAPP_TEMPLATE_SELLER_INTRO
WHATSAPP_TEMPLATE_SELLER_INTRO_LANG    # default 'en'
BULKSMS_TOKEN_ID                       # optional
BULKSMS_TOKEN_SECRET                   # optional
SENDGRID_API_KEY                       # optional
SENDGRID_FROM_EMAIL                    # optional
```

## Deploy

```bash
cd packages/api
npx supabase functions deploy dialog360-webhook        --project-ref sahvfsoclzgsuewbiiah --no-verify-jwt
npx supabase functions deploy dialog360-status-webhook --project-ref sahvfsoclzgsuewbiiah --no-verify-jwt
npx supabase functions deploy ops-api                  --project-ref sahvfsoclzgsuewbiiah
```

The two webhooks pass `--no-verify-jwt` because Dialog360 cannot send a
Supabase JWT. The `ops-api` keeps JWT verification on — the dashboard sends
the user's session JWT via the supabase-js client.

## Public URLs

```
https://sahvfsoclzgsuewbiiah.supabase.co/functions/v1/dialog360-webhook
https://sahvfsoclzgsuewbiiah.supabase.co/functions/v1/dialog360-status-webhook
https://sahvfsoclzgsuewbiiah.supabase.co/functions/v1/ops-api/<route>
```

`<route>` is one of:
`ops-send-message`, `notify-seller`, `send-quote`, `send-contract`, `send-notification`.

## Dialog360 webhook configuration

In the Dialog360 dashboard (Settings → Webhook), set:

- **Webhook URL**: `https://sahvfsoclzgsuewbiiah.supabase.co/functions/v1/dialog360-webhook`
- **Verify token**: same as `DIALOG360_WEBHOOK_VERIFY_TOKEN`
- **Status URL**  (if separate): `https://sahvfsoclzgsuewbiiah.supabase.co/functions/v1/dialog360-status-webhook`

The first GET will exchange `hub.challenge` and respond 200.

## Test the webhook end to end

```bash
curl -X POST https://sahvfsoclzgsuewbiiah.supabase.co/functions/v1/dialog360-webhook \
  -H 'Content-Type: application/json' \
  -d '{
    "object":"whatsapp_business_account",
    "entry":[{"id":"x","changes":[{"field":"messages","value":{
      "messaging_product":"whatsapp",
      "messages":[{"from":"27831234567","id":"wamid.test","timestamp":"1700000000","type":"text","text":{"body":"hi"}}]
    }}]}]
  }'
```

Expected: `200 {"status":"ok"}`. Then check:
- `audit_events` for a `deal_created` row (if 27831234567 was new).
- `conversation_messages` for a `user` + `assistant` pair on that phone.
- `supabase functions logs dialog360-webhook --project-ref sahvfsoclzgsuewbiiah`.

## Web dashboard wiring

Update the dashboard's API base URL from the local bot (e.g.
`http://localhost:3001/api`) to the ops-api function:

```
VITE_OPS_API_URL=https://sahvfsoclzgsuewbiiah.supabase.co/functions/v1/ops-api
```

Routes are unchanged — `${VITE_OPS_API_URL}/notify-seller`, etc.
