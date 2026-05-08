// Dialog360 message-status webhook (delivered / read / failed). Currently logs
// only — wire to a `message_status` table in a future phase if we want
// analytics. Mirrors packages/bot/src/handlers/webhook.ts handleStatusWebhook.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

interface StatusEntry {
  messaging_product: string
  statuses?: Array<{
    id: string
    recipient_id: string
    status: "sent" | "delivered" | "read" | "failed"
    timestamp: string
    errors?: Array<{ code: number; title: string }>
  }>
}
interface StatusPayload {
  object: string
  entry?: Array<{ id: string; changes: Array<{ value: StatusEntry; field: string }> }>
}

serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 })
  let payload: StatusPayload
  try { payload = await req.json() }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }) }
  if (payload?.entry) {
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const value = change.value
        if (!value.statuses?.length) continue
        for (const status of value.statuses) {
          console.log(JSON.stringify({
            ts: new Date().toISOString(), handler: "dialog360-status-webhook", level: "info",
            msg: "delivery status", data: {
              msg_id: status.id, to: status.recipient_id,
              status: status.status, errors: status.errors,
            },
          }))
        }
      }
    }
  }
  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200, headers: { "Content-Type": "application/json" },
  })
})
