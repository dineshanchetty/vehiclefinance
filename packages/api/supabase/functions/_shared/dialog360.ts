// Dialog360 / WhatsApp Business API client — Deno port of packages/bot/src/services/dialog360.ts
//
// Replaces axios with fetch. Reads DIALOG360_API_KEY and DIALOG360_API_URL from
// the edge-function env. Does NOT lazily evaluate so missing env throws on
// first use (caller catches and returns 500).

import { uploadFileToStorage } from "./supabase-helpers.ts"

const log = (level: "info" | "error", msg: string, data?: unknown) => {
  const entry = { ts: new Date().toISOString(), service: "dialog360", level, msg, data }
  if (level === "error") console.error(JSON.stringify(entry))
  else console.log(JSON.stringify(entry))
}

function cfg(): { apiKey: string; baseURL: string } {
  const apiKey = Deno.env.get("DIALOG360_API_KEY")
  const baseURL = Deno.env.get("DIALOG360_API_URL")
  if (!apiKey || !baseURL) {
    throw new Error("Missing required env vars: DIALOG360_API_KEY, DIALOG360_API_URL")
  }
  return { apiKey, baseURL: baseURL.replace(/\/$/, "") }
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const { apiKey, baseURL } = cfg()
  const res = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "D360-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = (await res.text()).slice(0, 500)
    throw new Error(`Dialog360 ${path} ${res.status}: ${txt}`)
  }
  return await res.json().catch(() => ({}))
}

export interface Button { id: string; title: string }

export async function sendTypingIndicator(messageId: string): Promise<void> {
  try {
    await postJson("/messages", {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: { type: "text" },
    })
  } catch (err) {
    log("error", "sendTypingIndicator failed", { messageId, err: String(err) })
  }
}

export async function sendTextMessage(phone: string, message: string): Promise<void> {
  log("info", "sendTextMessage", { phone })
  await postJson("/messages", {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "text",
    text: { body: message, preview_url: false },
  })
}

export async function sendTemplate(
  phone: string, templateName: string, languageCode: string, bodyParams: string[],
): Promise<void> {
  log("info", "sendTemplate", { phone, templateName })
  await postJson("/messages", {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: bodyParams.length > 0 ? [{
        type: "body",
        parameters: bodyParams.map((text) => ({ type: "text", text })),
      }] : [],
    },
  })
}

export async function sendInteractiveMessage(
  phone: string, body: string, buttons: Button[], header?: string, footer?: string,
): Promise<void> {
  if (buttons.length > 3) throw new Error("Dialog360 interactive messages support a maximum of 3 buttons")
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })),
      },
    },
  }
  const interactive = payload.interactive as Record<string, unknown>
  if (header) interactive.header = { type: "text", text: header }
  if (footer) interactive.footer = { text: footer }
  await postJson("/messages", payload)
}

export interface ListRow { id: string; title: string; description?: string }
export interface ListSection { title?: string; rows: ListRow[] }

export async function sendListMessage(
  phone: string, body: string, buttonText: string, sections: ListSection[],
  header?: string, footer?: string,
): Promise<void> {
  const totalRows = sections.reduce((n, s) => n + s.rows.length, 0)
  if (totalRows > 10) throw new Error("WhatsApp list messages support max 10 rows total")
  if (totalRows < 1) throw new Error("WhatsApp list messages require at least 1 row")
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      action: {
        button: buttonText,
        sections: sections.map((s) => ({
          ...(s.title ? { title: s.title } : {}),
          rows: s.rows.map((r) => ({
            id: r.id, title: r.title, ...(r.description ? { description: r.description } : {}),
          })),
        })),
      },
    },
  }
  const interactive = payload.interactive as Record<string, unknown>
  if (header) interactive.header = { type: "text", text: header }
  if (footer) interactive.footer = { text: footer }
  await postJson("/messages", payload)
}

export async function sendImageMessage(phone: string, imageUrl: string, caption?: string): Promise<void> {
  await postJson("/messages", {
    messaging_product: "whatsapp", recipient_type: "individual", to: phone,
    type: "image", image: { link: imageUrl, ...(caption ? { caption } : {}) },
  })
}

export async function sendDocumentMessage(
  phone: string, docUrl: string, filename: string, caption?: string,
): Promise<void> {
  await postJson("/messages", {
    messaging_product: "whatsapp", recipient_type: "individual", to: phone,
    type: "document", document: { link: docUrl, filename, ...(caption ? { caption } : {}) },
  })
}

/**
 * Download a media file by its Dialog360 media ID.
 * 2-step: GET /{mediaId} → {url, mime_type}; rewrite host to D360 proxy; GET bytes.
 */
export async function downloadMedia(mediaId: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const { apiKey, baseURL } = cfg()
  const metaRes = await fetch(`${baseURL}/${mediaId}`, { headers: { "D360-API-KEY": apiKey } })
  if (!metaRes.ok) throw new Error(`Dialog360 media meta ${metaRes.status}`)
  const meta = await metaRes.json() as { url: string; mime_type: string }
  const proxiedUrl = meta.url.replace(/^https:\/\/lookaside\.fbsbx\.com/, baseURL)
  const fileRes = await fetch(proxiedUrl, { headers: { "D360-API-KEY": apiKey } })
  if (!fileRes.ok) throw new Error(`Dialog360 media download ${fileRes.status}`)
  const buf = await fileRes.arrayBuffer()
  return { bytes: new Uint8Array(buf), mimeType: meta.mime_type ?? "application/octet-stream" }
}

export async function downloadAndStoreMedia(
  mediaId: string, storagePath: string,
): Promise<{ publicUrl: string; mimeType: string }> {
  const { bytes, mimeType } = await downloadMedia(mediaId)
  const publicUrl = await uploadFileToStorage("documents", storagePath, bytes, mimeType)
  return { publicUrl, mimeType }
}
