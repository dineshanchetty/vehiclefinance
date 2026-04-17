// Shared Anthropic / Claude helper for Edge Functions.
// Wraps the SDK so individual functions don't each have to import + construct
// a client. Secrets are read from Deno env:
//
//   ANTHROPIC_API_KEY — set via `supabase secrets set`.

import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.89.0"

// ── Re-exported types callers need ──────────────────────────────────────────
// We keep these narrow so call sites stay readable. See the Anthropic SDK
// for the full type tree if you need more nuance.

export type ContentBlockImage = {
  type: "image"
  source:
    | { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string }
    | { type: "url"; url: string }
}

export type ContentBlockText = {
  type: "text"
  text: string
}

export type ContentBlock = ContentBlockImage | ContentBlockText

export type Message = {
  role: "user" | "assistant"
  content: string | ContentBlock[]
}

export type CreateMessageRequest = {
  model: string
  max_tokens: number
  messages: Message[]
  system?: string
}

// Claude response type — narrow view of what we actually read.
export type CreateMessageResponse = {
  id: string
  content: Array<{ type: "text"; text: string } | { type: string; [k: string]: unknown }>
  stop_reason: string | null
  model: string
  usage: { input_tokens: number; output_tokens: number }
}

// ── Client ──────────────────────────────────────────────────────────────────
let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (_client) return _client
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!apiKey) {
    throw new Error(
      "Edge function is missing ANTHROPIC_API_KEY. Set via `supabase secrets set`.",
    )
  }
  _client = new Anthropic({ apiKey })
  return _client
}

/** Thin wrapper around `client.messages.create`. */
export async function createMessage(req: CreateMessageRequest): Promise<CreateMessageResponse> {
  const client = getClient()
  const resp = await client.messages.create({
    model: req.model,
    max_tokens: req.max_tokens,
    messages: req.messages as never, // SDK types are more specific; we downcast
    ...(req.system ? { system: req.system } : {}),
  })
  return resp as unknown as CreateMessageResponse
}
