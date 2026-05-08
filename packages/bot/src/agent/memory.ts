/**
 * Persistent conversation memory backed by Supabase.
 *
 * Migration suggestion — run in Supabase SQL editor:
 *
 * create table if not exists conversation_messages (
 *   id          uuid primary key default gen_random_uuid(),
 *   phone       text not null,
 *   deal_id     uuid references deals(id) on delete set null,
 *   party_type  text check (party_type in ('buyer', 'seller')),
 *   role        text not null check (role in ('user', 'assistant')),
 *   content     text not null,
 *   tool_use    jsonb,
 *   created_at  timestamptz not null default now()
 * );
 *
 * create index on conversation_messages (phone, created_at desc);
 * create index on conversation_messages (deal_id, created_at desc);
 */

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseClient } from '../services/supabase.js';

export interface StoredMessage {
  id: string;
  phone: string;
  deal_id: string | null;
  party_type: string | null;
  role: 'user' | 'assistant';
  content: string;
  tool_use: unknown;
  created_at: string;
}

const DEFAULT_HISTORY_LIMIT = 30;

export async function loadConversationHistory(
  phone: string,
  limit = DEFAULT_HISTORY_LIMIT,
  partyType?: 'buyer' | 'seller',
): Promise<StoredMessage[]> {
  const sb = getSupabaseClient();
  let q = sb
    .from('conversation_messages')
    .select('*')
    .eq('phone', phone)
  // Scope by party so a phone that's now seller doesn't replay its old
  // buyer history — different system prompt, different role, different
  // expected behaviour.
  if (partyType) {
    // Match either the requested party or rows with no party tag (legacy
    // bot writes pre-party_type column being populated). Excludes the
    // OPPOSITE party's history, which is the bleed we're fixing.
    q = q.or(`party_type.eq.${partyType},party_type.is.null`)
  }
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as StoredMessage[]).reverse();
}

export async function saveMessage(
  phone: string,
  role: 'user' | 'assistant',
  content: string,
  options?: {
    deal_id?: string;
    party_type?: 'buyer' | 'seller';
    tool_use?: unknown;
  },
): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from('conversation_messages').insert({
    phone,
    role,
    content,
    deal_id: options?.deal_id ?? null,
    party_type: options?.party_type ?? null,
    tool_use: options?.tool_use ?? null,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/**
 * Build the messages array for an Anthropic API call.
 * Returns all stored messages formatted as Anthropic MessageParam objects.
 */
export function buildMessagesArray(
  history: StoredMessage[],
  latestUserMessage: string,
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  messages.push({ role: 'user', content: latestUserMessage });
  return messages;
}

/**
 * Keep the conversation window manageable by pruning old messages.
 * Retains the most recent `keepLast` messages.
 */
export async function pruneOldMessages(phone: string, keepLast = 50): Promise<void> {
  const sb = getSupabaseClient();

  // Find the cutoff created_at by fetching the keepLast-th most recent message
  const { data: boundary, error: boundaryError } = await sb
    .from('conversation_messages')
    .select('created_at')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .range(keepLast - 1, keepLast - 1)
    .single();

  if (boundaryError || !boundary) return; // fewer than keepLast messages — nothing to prune

  const { error } = await sb
    .from('conversation_messages')
    .delete()
    .eq('phone', phone)
    .lt('created_at', boundary.created_at);

  if (error) throw error;
}
