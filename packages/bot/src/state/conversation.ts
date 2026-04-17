/**
 * Conversation state module for the WhatsApp bot.
 *
 * Provides loadState, saveState, advance, and markStuckIfIdle.
 * All writes are persisted to the conversation_state table before returning —
 * no in-memory session cache is used.
 */

import { getSupabaseClient } from '../services/supabase.js';
import type {
  ConversationContext,
  ConversationState,
  FlowStep,
  PartyType,
} from '../types/index.js';

const TABLE = 'conversation_state';

const log = (level: 'info' | 'warn' | 'error', msg: string, data?: unknown) => {
  const entry = { ts: new Date().toISOString(), module: 'state/conversation', level, msg, data };
  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Full conversation state row including escalation tracking columns. */
export interface ConversationStateRow extends ConversationState {
  malformed_count: number;
  is_stuck: boolean;
  created_at?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// loadState
// ---------------------------------------------------------------------------

/**
 * Load the persisted conversation state for a phone number.
 * Returns null when no record exists (i.e. brand-new contact).
 */
export async function loadState(phone: string): Promise<ConversationStateRow | null> {
  log('info', 'loadState', { phone });
  const sb = getSupabaseClient();
  const { data, error } = await sb.from(TABLE).select('*').eq('phone', phone).maybeSingle();
  if (error) {
    log('error', 'loadState failed', { phone, error });
    throw error;
  }
  return (data as ConversationStateRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// saveState
// ---------------------------------------------------------------------------

/**
 * Create or fully replace the conversation state for a phone number.
 * Performs a shallow merge of the context object so callers may pass partial patches.
 * MUST be called before the handler returns to satisfy the persistence contract.
 */
export async function saveState(
  phone: string,
  step: FlowStep,
  partyType: PartyType,
  dealId: string | null,
  contextPatch: Partial<ConversationContext> = {},
  malformedCount = 0,
  isStuck = false,
): Promise<void> {
  log('info', 'saveState', { phone, step, partyType, dealId, isStuck });
  const sb = getSupabaseClient();

  // Fetch existing context for shallow merge
  const existing = await loadState(phone);
  const mergedContext: ConversationContext = { ...(existing?.context ?? {}), ...contextPatch };

  const record = {
    phone,
    party_type: partyType,
    current_step: step,
    deal_id: dealId,
    last_activity: new Date().toISOString(),
    context: mergedContext,
    malformed_count: malformedCount,
    is_stuck: isStuck,
  };

  const { error } = await sb.from(TABLE).upsert(record, { onConflict: 'phone' });
  if (error) {
    log('error', 'saveState failed', { phone, step, error });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// advance
// ---------------------------------------------------------------------------

/**
 * Advance the state machine to nextStep and persist immediately.
 * Merges contextPatch into the existing context.
 * Resets malformed_count to 0 on a valid transition.
 */
export async function advance(
  phone: string,
  nextStep: FlowStep,
  partyType: PartyType,
  dealId: string | null,
  contextPatch: Partial<ConversationContext> = {},
): Promise<void> {
  await saveState(phone, nextStep, partyType, dealId, contextPatch, 0, false);
}

// ---------------------------------------------------------------------------
// incrementMalformed
// ---------------------------------------------------------------------------

/**
 * Increment the malformed-input counter and set is_stuck when it reaches 3.
 * Returns the updated malformed_count so callers can decide to escalate.
 */
export async function incrementMalformed(phone: string): Promise<number> {
  const existing = await loadState(phone);
  if (!existing) return 0;

  const newCount = (existing.malformed_count ?? 0) + 1;
  const isStuck = newCount >= 3;

  await saveState(
    phone,
    existing.current_step,
    existing.party_type,
    existing.deal_id,
    {},
    newCount,
    isStuck,
  );

  log(isStuck ? 'warn' : 'info', 'incrementMalformed', { phone, newCount, isStuck });
  return newCount;
}

// ---------------------------------------------------------------------------
// markStuckIfIdle
// ---------------------------------------------------------------------------

/**
 * Mark a conversation as stuck if it has been idle for more than idleMinutes.
 * Called by the timeout scheduler.  Returns true when the record was updated.
 */
export async function markStuckIfIdle(phone: string, idleMinutes: number): Promise<boolean> {
  const existing = await loadState(phone);
  if (!existing || existing.is_stuck || existing.current_step === 'DONE') {
    return false;
  }

  const threshold = new Date(Date.now() - idleMinutes * 60 * 1000);
  const lastActivity = new Date(existing.last_activity);

  if (lastActivity < threshold) {
    await saveState(
      phone,
      existing.current_step,
      existing.party_type,
      existing.deal_id,
      existing.context,
      existing.malformed_count,
      true,
    );
    log('warn', 'markStuckIfIdle — marked stuck', { phone, idleMinutes });
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// getIdleConversations
// ---------------------------------------------------------------------------

/**
 * Return all non-terminal conversations idle beyond idleMinutes.
 * Used by the escalation/reminder scheduler.
 */
export async function getIdleConversations(idleMinutes: number): Promise<ConversationStateRow[]> {
  const sb = getSupabaseClient();
  const threshold = new Date(Date.now() - idleMinutes * 60 * 1000).toISOString();

  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .lt('last_activity', threshold)
    .neq('current_step', 'DONE');

  if (error) {
    log('error', 'getIdleConversations failed', { error });
    throw error;
  }

  return (data ?? []) as ConversationStateRow[];
}

// ---------------------------------------------------------------------------
// deleteState
// ---------------------------------------------------------------------------

/**
 * Remove all persisted state for a phone number (full reset).
 */
export async function deleteState(phone: string): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from(TABLE).delete().eq('phone', phone);
  if (error) {
    log('error', 'deleteState failed', { phone, error });
    throw error;
  }
}
