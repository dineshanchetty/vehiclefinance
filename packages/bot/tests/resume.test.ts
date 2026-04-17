/**
 * Returning-user tests — verifies that a user who returns to the bot
 * resumes at the correct persisted state rather than starting over.
 */

import { describe, it, expect, beforeEach } from 'vitest';

process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import './setup.js';
import { resetStores, stateStore } from './setup.js';

import { handleBuyerMessage } from '../src/flows/buyer-flow.js';
import { handleSellerMessage } from '../src/flows/seller-flow.js';
import type { ConversationState, D360Message } from '../src/types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textMsg(body: string, phone = '27821234567'): D360Message {
  return {
    from: phone,
    id: `msg-${Date.now()}`,
    timestamp: Date.now().toString(),
    type: 'text',
    text: { body },
  };
}

function imageMsg(phone = '27821234567'): D360Message {
  return {
    from: phone,
    id: `img-${Date.now()}`,
    timestamp: Date.now().toString(),
    type: 'image',
    image: { id: 'media-resume', mime_type: 'image/jpeg', sha256: 'abc' },
  };
}

function stateFor(phone: string, step: string, ctx: Record<string, unknown> = {}): ConversationState {
  return {
    phone,
    party_type: 'buyer',
    current_step: step as ConversationState['current_step'],
    deal_id: 'deal-uuid-abc',
    last_activity: new Date(Date.now() - 60_000).toISOString(),
    context: ctx,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStores();
});

describe('Resume — buyer', () => {
  it('resumes at POA_UPLOAD if state was persisted there', async () => {
    const phone = '27821110001';
    const savedState = stateFor(phone, 'POA_UPLOAD');

    // Seed state into store so loadState returns it
    stateStore.set(phone, savedState as unknown as Record<string, unknown>);

    const result = await handleBuyerMessage(imageMsg(phone), savedState);
    expect(result.nextStep).toBe('BANK_STATEMENT_UPLOAD');
  });

  it('resumes at BANK_STATEMENT_UPLOAD mid-flow', async () => {
    const phone = '27821110002';
    const savedState = stateFor(phone, 'BANK_STATEMENT_UPLOAD', { bank_statements_received: 1 });

    stateStore.set(phone, savedState as unknown as Record<string, unknown>);

    // Second statement
    const result = await handleBuyerMessage(imageMsg(phone), savedState);
    expect(result.nextStep).toBe('BANK_STATEMENT_UPLOAD');
  });

  it('resumes at WAITING_FOR_QUOTE and stays there', async () => {
    const phone = '27821110003';
    const savedState = stateFor(phone, 'WAITING_FOR_QUOTE');

    stateStore.set(phone, savedState as unknown as Record<string, unknown>);

    const result = await handleBuyerMessage(textMsg('any message', phone), savedState);
    expect(result.nextStep).toBe('WAITING_FOR_QUOTE');
  });

  it('resumes at SELLER_DETAILS and accepts a phone number', async () => {
    const phone = '27821110004';
    const savedState = stateFor(phone, 'SELLER_DETAILS');

    stateStore.set(phone, savedState as unknown as Record<string, unknown>);

    const result = await handleBuyerMessage(textMsg('+27831234567', phone), savedState);
    expect(result.nextStep).toBe('WAITING_FOR_QUOTE');
  });
});

describe('Resume — seller', () => {
  it('resumes at VEHICLE_PHOTOS with prior photos intact', async () => {
    const phone = '27831110001';
    const priorPhotos = ['FRONT_VIEW', 'REAR_VIEW'];
    const savedState: ConversationState = {
      phone,
      party_type: 'seller',
      current_step: 'VEHICLE_PHOTOS',
      deal_id: 'deal-uuid-xyz',
      last_activity: new Date(Date.now() - 60_000).toISOString(),
      context: { photos_received: priorPhotos },
    };

    stateStore.set(phone, savedState as unknown as Record<string, unknown>);

    const result = await handleSellerMessage(imageMsg(phone), savedState);
    expect(result.nextStep).toBe('VEHICLE_PHOTOS');
    const updatedPhotos = (result.dealUpdate as Record<string, unknown> | undefined)?.photos_received as string[] | undefined;
    expect(updatedPhotos?.length).toBeGreaterThan(priorPhotos.length);
  });

  it('resumes at WAITING_FOR_CONTRACT and stays there', async () => {
    const phone = '27831110002';
    const savedState: ConversationState = {
      phone,
      party_type: 'seller',
      current_step: 'WAITING_FOR_CONTRACT',
      deal_id: 'deal-uuid-xyz',
      last_activity: new Date(Date.now() - 60_000).toISOString(),
      context: {},
    };

    stateStore.set(phone, savedState as unknown as Record<string, unknown>);

    const result = await handleSellerMessage(textMsg('when?', phone), savedState);
    expect(result.nextStep).toBe('WAITING_FOR_CONTRACT');
  });
});
