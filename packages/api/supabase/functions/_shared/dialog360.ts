// Dialog360 (360dialog) WhatsApp Business API helper

const D360_API_URL = Deno.env.get("DIALOG360_API_URL") ?? "https://waba.360dialog.io/v1"
const D360_API_KEY = Deno.env.get("DIALOG360_API_KEY") ?? ""

export interface D360TextMessage {
  to: string
  type: "text"
  text: { body: string; preview_url?: boolean }
}

export interface D360TemplateMessage {
  to: string
  type: "template"
  template: {
    namespace: string
    name: string
    language: { code: string }
    components?: Array<{
      type: string
      parameters: Array<{ type: string; text?: string }>
    }>
  }
}

export type D360Message = D360TextMessage | D360TemplateMessage

export async function sendWhatsAppMessage(message: D360Message): Promise<void> {
  const res = await fetch(`${D360_API_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "D360-API-KEY": D360_API_KEY,
    },
    body: JSON.stringify(message),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Dialog360 send failed (${res.status}): ${body}`)
  }
}

export async function downloadMedia(mediaId: string): Promise<Uint8Array> {
  // 1. Get media URL
  const urlRes = await fetch(`${D360_API_URL}/media/${mediaId}`, {
    headers: { "D360-API-KEY": D360_API_KEY },
  })
  if (!urlRes.ok) throw new Error(`Dialog360 media URL fetch failed: ${urlRes.status}`)
  const { url } = await urlRes.json()

  // 2. Download the actual bytes
  const dlRes = await fetch(url, {
    headers: { "D360-API-KEY": D360_API_KEY },
  })
  if (!dlRes.ok) throw new Error(`Dialog360 media download failed: ${dlRes.status}`)
  const buf = await dlRes.arrayBuffer()
  return new Uint8Array(buf)
}

/** Build a simple text reply back to a WhatsApp number */
export function textMessage(to: string, body: string): D360TextMessage {
  return { to, type: "text", text: { body } }
}
