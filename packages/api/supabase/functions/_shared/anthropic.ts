// Thin Anthropic API client for Deno Edge Functions
// Uses fetch directly — no Node SDK dependency.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1"
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? ""
const ANTHROPIC_VERSION = "2023-06-01"

export interface ContentBlockText {
  type: "text"
  text: string
}

export interface ContentBlockToolUse {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ContentBlockToolResult {
  type: "tool_result"
  tool_use_id: string
  content: string | Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } }>
}

export interface ContentBlockImage {
  type: "image"
  source: {
    type: "base64"
    media_type: string
    data: string
  }
}

export type ContentBlock =
  | ContentBlockText
  | ContentBlockToolUse
  | ContentBlockToolResult
  | ContentBlockImage

export interface Message {
  role: "user" | "assistant"
  content: string | ContentBlock[]
}

export interface Tool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface MessagesRequest {
  model: string
  max_tokens: number
  system?: string
  messages: Message[]
  tools?: Tool[]
  tool_choice?: { type: "auto" | "any" | "tool"; name?: string }
}

export interface MessagesResponse {
  id: string
  type: "message"
  role: "assistant"
  content: ContentBlock[]
  model: string
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence"
  usage: { input_tokens: number; output_tokens: number }
}

export async function createMessage(req: MessagesRequest): Promise<MessagesResponse> {
  const res = await fetch(`${ANTHROPIC_API_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(req),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic API error (${res.status}): ${body}`)
  }

  return res.json() as Promise<MessagesResponse>
}

/** Extract the first text block from a response, or empty string */
export function extractText(response: MessagesResponse): string {
  for (const block of response.content) {
    if (block.type === "text") return block.text
  }
  return ""
}

/** Extract all tool_use blocks from a response */
export function extractToolUses(response: MessagesResponse): ContentBlockToolUse[] {
  return response.content.filter(
    (b): b is ContentBlockToolUse => b.type === "tool_use"
  )
}
