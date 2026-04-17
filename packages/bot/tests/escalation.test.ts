/**
 * Escalation tests — 3 malformed inputs in a row trigger Q_HUMAN_ESCALATION.
 * Tests both buyer and seller flows.
 */

import { describe, it, expect, beforeEach } from 'vitest';

process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import './setup.js';
import { resetStores, stateStore, tasksStore } from './setup.js';

import { handleBuyerMessage } from '../src/flows/buyer-flow.js';
import { handleSellerMessage } from '../src/flows/seller-flow.js';
import type { ConversationState, D360Message } from '../src/types/index.js';
import { STRINGS } from '../src/flows/strings.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textMsg(body: string, phone: string): D360Message {
  return {
    from: phone,
    id: `msg-esc-${Date.now()}`,
    timestamp: Date.now().toString(),
    type: 'text',
    text: { body },
  };
}

function buyerStateAt(
  phone: string,
  step: string,
  malformedCount = 0,
): ConversationState {
  return {
    phone,
    party_type: 'buyer',
    current_step: step as ConversationState['current_step'],
    deal_id: 'deal-esc-001',
    last_activity: new Date().toISOString(),
    context: { malformed_count: malformedCount },
  };
}

function sellerStateAt(
  phone: string,
  step: string,
  malformedCount = 0,
): ConversationState {
  return {
    phone,
    party_type: 'seller',
    current_step: step as ConversationState['current_step'],
    deal_id: 'deal-esc-002',
    last_activity: new Date().toISOString(),
    context: { malformed_count: malformedCount },
  };
}

/**
 * Seed a state row with a given malformed_count into the mock store so that
 * incrementMalformed picks up the correct prior count.
 */
function seedState(state: ConversationState, malformedCount: number): void {
  stateStore.set(state.phone, {
    ...(state as unknown as Record<string, unknown>),
    malformed_count: malformedCount,
    is_stuck: false,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStores();
});

describe('Escalation — buyer flow', () => {
  it('escalates after 3 malformed inputs at ID_UPLOAD', async () => {
    const phone = '27821990001';
    const state = buyerStateAt(phone, 'ID_UPLOAD');
    // Seed store with malformed_count = 2 (one short of escalation)
    seedState(state, 2);

    // Third bad input (no media)
    const result = await handleBuyerMessage(textMsg('text instead of image', phone), state);

    expect(result.nextStep).toBe('DONE');
    const textResp = result.responses.find((r) => r.type === 'text') as { type: 'text'; text: string } | undefined;
    expect(textResp?.text).toBe(STRINGS.ESCALATED_TO_HUMAN);

    // An ops task should have been created
    const escalationTask = tasksStore.find(
      (t) => (t as Record<string, unknown>).task_type === 'Q_HUMAN_ESCALATION',
    );
    expect(escalationTask).toBeDefined();
  });

  it('escalates after 3 malformed inputs at CONSENT', async () => {
    const phone = '27821990002';
    const state = buyerStateAt(phone, 'CONSENT');
    seedState(state, 2);

    const result = await handleBuyerMessage(textMsg('maybe', phone), state);

    expect(result.nextStep).toBe('DONE');
    const textResp = result.responses.find((r) => r.type === 'text') as { type: 'text'; text: string } | undefined;
    expect(textResp?.text).toBe(STRINGS.ESCALATED_TO_HUMAN);
  });

  it('escalates after 3 malformed inputs at SELLER_DETAILS', async () => {
    const phone = '27821990003';
    const state = buyerStateAt(phone, 'SELLER_DETAILS');
    seedState(state, 2);

    const result = await handleBuyerMessage(textMsg('not a phone', phone), state);
    expect(result.nextStep).toBe('DONE');
  });

  it('does not escalate on 2nd malformed input (below threshold)', async () => {
    const phone = '27821990004';
    const state = buyerStateAt(phone, 'ID_UPLOAD');
    seedState(state, 1);

    const result = await handleBuyerMessage(textMsg('text again', phone), state);
    expect(result.nextStep).toBe('ID_UPLOAD');
  });
});

describe('Escalation — seller flow', () => {
  it('escalates after 3 malformed inputs at VEHICLE_DOC_UPLOAD', async () => {
    const phone = '27831990001';
    const state = sellerStateAt(phone, 'VEHICLE_DOC_UPLOAD');
    seedState(state, 2);

    const result = await handleSellerMessage(textMsg('text instead of doc', phone), state);
    expect(result.nextStep).toBe('DONE');
    const textResp = result.responses.find((r) => r.type === 'text') as { type: 'text'; text: string } | undefined;
    expect(textResp?.text).toBe(STRINGS.ESCALATED_TO_HUMAN);
  });

  it('escalates after 3 malformed inputs at VEHICLE_PHOTOS', async () => {
    const phone = '27831990002';
    const state = sellerStateAt(phone, 'VEHICLE_PHOTOS');
    state.context.photos_received = [];
    seedState(state, 2);

    const result = await handleSellerMessage(textMsg('sending soon', phone), state);
    expect(result.nextStep).toBe('DONE');
  });
});
