// Persistent conversation memory backed by Supabase. Deno port of
// packages/bot/src/agent/memory.ts.

import { getSupabaseClient } from "./supabase.ts"

export interface StoredMessage {
  id: string
  phone: string
  deal_id: string | null
  party_type: string | null
  role: "user" | "assistant"
  content: string
  tool_use: unknown
  created_at: string
}

const DEFAULT_HISTORY_LIMIT = 30

export async function loadConversationHistory(
  phone: string, limit = DEFAULT_HISTORY_LIMIT, partyType?: "buyer" | "seller",
): Promise<StoredMessage[]> {
  const sb = getSupabaseClient()
  let q = sb.from("conversation_messages").select("*").eq("phone", phone)
  if (partyType) q = q.or(`party_type.eq.${partyType},party_type.is.null`)
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit)
  if (error) throw error
  return ((data ?? []) as StoredMessage[]).reverse()
}

export async function saveMessage(
  phone: string,
  role: "user" | "assistant",
  content: string,
  options?: { deal_id?: string; party_type?: "buyer" | "seller"; tool_use?: unknown },
): Promise<void> {
  const sb = getSupabaseClient()
  const { error } = await sb.from("conversation_messages").insert({
    phone, role, content,
    deal_id: options?.deal_id ?? null,
    party_type: options?.party_type ?? null,
    tool_use: options?.tool_use ?? null,
    created_at: new Date().toISOString(),
  })
  if (error) throw error
}

// Anthropic message-param shape (kept loose to avoid SDK type pull-in here).
export interface MessageParam {
  role: "user" | "assistant"
  content: string | Array<Record<string, unknown>>
}

export function buildMessagesArray(
  history: StoredMessage[], latestUserMessage: string,
): MessageParam[] {
  const messages: MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }))
  messages.push({ role: "user", content: latestUserMessage })
  return messages
}

export async function pruneOldMessages(phone: string, keepLast = 50): Promise<void> {
  const sb = getSupabaseClient()
  const { data: boundary, error: boundaryError } = await sb
    .from("conversation_messages").select("created_at").eq("phone", phone)
    .order("created_at", { ascending: false })
    .range(keepLast - 1, keepLast - 1).single()
  if (boundaryError || !boundary) return
  const { error } = await sb.from("conversation_messages").delete()
    .eq("phone", phone).lt("created_at", boundary.created_at)
  if (error) throw error
}
