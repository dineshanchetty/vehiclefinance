/**
 * Conversation state management backed by Supabase.
 *
 * Schema (suggested migration):
 *
 *   create table conversation_states (
 *     phone          text primary key,
 *     party_type     text not null,           -- 'buyer' | 'seller'
 *     current_step   text not null,
 *     deal_id        uuid references deals(id),
 *     last_activity  timestamptz not null default now(),
 *     context        jsonb not null default '{}'::jsonb
 *   );
 *
 *   create index on conversation_states (deal_id);
 */

import { getSupabaseClient } from './supabase.js';
import type {
  ConversationContext,
  ConversationState,
  FlowStep,
  PartyType,
} from '../types/index.js';

const log = (level: 'info' | 'error', msg: string, data?: unknown) => {
  const entry = { ts: new Date().toISOString(), service: 'conversation-state', level, msg, data };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
};

const TABLE = 'conversation_states';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieve the current conversation state for a phone number.
 *
 * @param phone - E.164 phone number used as the primary key
 * @returns Existing state record, or null if this is a new conversation
 */
export async function getState(phone: string): Promise<ConversationState | null> {
  log('info', 'getState', { phone });
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (error) {
    log('error', 'getState failed', { phone, error });
    throw error;
  }

  return data as ConversationState | null;
}

/**
 * Create or update the conversation state for a phone number.
 *
 * @param phone       - E.164 phone number
 * @param step        - New flow step
 * @param partyType   - 'buyer' or 'seller' (required on first write)
 * @param dealId      - Associated deal UUID (null while no deal exists yet)
 * @param context     - Arbitrary JSONB context; merged shallowly with existing context
 */
export async function setState(
  phone: string,
  step: FlowStep,
  partyType: PartyType,
  dealId: string | null,
  context: ConversationContext = {},
): Promise<void> {
  log('info', 'setState', { phone, step, partyType, dealId });
  const supabase = getSupabaseClient();

  // Fetch existing context so we can do a shallow merge
  const existing = await getState(phone);
  const mergedContext: ConversationContext = { ...(existing?.context ?? {}), ...context };

  const record: ConversationState = {
    phone,
    party_type: partyType,
    current_step: step,
    deal_id: dealId,
    last_activity: new Date().toISOString(),
    context: mergedContext,
  };

  const { error } = await supabase.from(TABLE).upsert(record, { onConflict: 'phone' });

  if (error) {
    log('error', 'setState failed', { phone, step, error });
    throw error;
  }
}

/**
 * Partially update only the context for an existing conversation.
 * Useful when the step hasn't changed but context keys need updating.
 *
 * @param phone      - E.164 phone number
 * @param contextPatch - Partial context to merge
 */
export async function patchContext(
  phone: string,
  contextPatch: Partial<ConversationContext>,
): Promise<void> {
  log('info', 'patchContext', { phone });
  const supabase = getSupabaseClient();

  const existing = await getState(phone);
  if (!existing) {
    throw new Error(`No conversation state found for phone: ${phone}`);
  }

  const mergedContext: ConversationContext = { ...existing.context, ...contextPatch };

  const { error } = await supabase
    .from(TABLE)
    .update({ context: mergedContext, last_activity: new Date().toISOString() })
    .eq('phone', phone);

  if (error) {
    log('error', 'patchContext failed', { phone, error });
    throw error;
  }
}

/**
 * Delete all conversation state for a phone number.
 * Called when a conversation is fully completed or explicitly reset.
 *
 * @param phone - E.164 phone number
 */
export async function clearState(phone: string): Promise<void> {
  log('info', 'clearState', { phone });
  const supabase = getSupabaseClient();

  const { error } = await supabase.from(TABLE).delete().eq('phone', phone);

  if (error) {
    log('error', 'clearState failed', { phone, error });
    throw error;
  }
}

/**
 * Return all conversations that have been idle beyond the given threshold.
 * Used by the reminder scheduler.
 *
 * @param idleMinutes - Number of minutes since last_activity
 * @returns Array of stale conversation states
 */
export async function getIdleConversations(idleMinutes: number): Promise<ConversationState[]> {
  log('info', 'getIdleConversations', { idleMinutes });
  const supabase = getSupabaseClient();

  const threshold = new Date(Date.now() - idleMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .lt('last_activity', threshold)
    .neq('current_step', 'DONE');

  if (error) {
    log('error', 'getIdleConversations failed', { error });
    throw error;
  }

  return (data ?? []) as ConversationState[];
}
