/**
 * Per-state transition tests for the buyer flow.
 * All external services (Supabase, Dialog360) are mocked.
 */

import { describe, it, expect } from 'vitest';

// Set required env vars before importing anything that uses Supabase
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// Import mocks first — vi.mock hoisting will apply them before module resolution
import './setup.js';

import { handleBuyerMessage, newBuyerState } from '../src/flows/buyer-flow.js';
import type { ConversationState, D360Message } from '../src/types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textMsg(body: string): D360Message {
  return {
    from: '27821234567',
    id: 'msg-1',
    timestamp: Date.now().toString(),
    type: 'text',
    text: { body },
  };
}

function buttonMsg(id: string, title: string): D360Message {
  return {
    from: '27821234567',
    id: 'msg-2',
    timestamp: Date.now().toString(),
    type: 'interactive',
    interactive: { type: 'button_reply', button_reply: { id, title } },
  };
}

function imageMsg(caption?: string): D360Message {
  return {
    from: '27821234567',
    id: 'msg-3',
    timestamp: Date.now().toString(),
    type: 'image',
    image: { id: 'media-123', mime_type: 'image/jpeg', sha256: 'abc', caption },
  };
}

function stateAt(step: string, extra: Partial<ConversationState> = {}): ConversationState {
  return {
    ...newBuyerState('27821234567'),
    current_step: step as ConversationState['current_step'],
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Buyer flow — WELCOME', () => {
  it('always transitions to CONSENT regardless of input', async () => {
    const result = await handleBuyerMessage(textMsg('hello'), stateAt('WELCOME'));
    expect(result.nextStep).toBe('CONSENT');
    expect(result.responses.length).toBeGreaterThan(0);
  });
});

describe('Buyer flow — CONSENT', () => {
  it('transitions to ID_UPLOAD when buyer agrees via button', async () => {
    const result = await handleBuyerMessage(
      buttonMsg('consent_yes', 'Yes, I agree'),
      stateAt('CONSENT'),
    );
    expect(result.nextStep).toBe('ID_UPLOAD');
  });

  it('transitions to ID_UPLOAD when buyer types "yes"', async () => {
    const result = await handleBuyerMessage(textMsg('yes'), stateAt('CONSENT'));
    expect(result.nextStep).toBe('ID_UPLOAD');
  });

  it('transitions to DONE when buyer declines via button', async () => {
    const result = await handleBuyerMessage(
      buttonMsg('consent_no', 'No, decline'),
      stateAt('CONSENT'),
    );
    expect(result.nextStep).toBe('DONE');
  });

  it('stays at CONSENT on ambiguous input', async () => {
    const result = await handleBuyerMessage(textMsg('maybe later'), stateAt('CONSENT'));
    expect(result.nextStep).toBe('CONSENT');
  });
});

describe('Buyer flow — ID_UPLOAD', () => {
  it('transitions to POA_UPLOAD when media received', async () => {
    const result = await handleBuyerMessage(imageMsg(), stateAt('ID_UPLOAD'));
    expect(result.nextStep).toBe('POA_UPLOAD');
  });

  it('stays at ID_UPLOAD when no media', async () => {
    const result = await handleBuyerMessage(textMsg('here is my ID'), stateAt('ID_UPLOAD'));
    expect(result.nextStep).toBe('ID_UPLOAD');
  });
});

describe('Buyer flow — POA_UPLOAD', () => {
  it('transitions to BANK_STATEMENT_UPLOAD when media received', async () => {
    const result = await handleBuyerMessage(imageMsg(), stateAt('POA_UPLOAD'));
    expect(result.nextStep).toBe('BANK_STATEMENT_UPLOAD');
  });

  it('stays at POA_UPLOAD when no media', async () => {
    const result = await handleBuyerMessage(textMsg('here is my POA'), stateAt('POA_UPLOAD'));
    expect(result.nextStep).toBe('POA_UPLOAD');
  });
});

describe('Buyer flow — BANK_STATEMENT_UPLOAD', () => {
  it('increments count and stays at BANK_STATEMENT_UPLOAD for first statement', async () => {
    const result = await handleBuyerMessage(
      imageMsg(),
      stateAt('BANK_STATEMENT_UPLOAD', { context: { bank_statements_received: 0 } }),
    );
    expect(result.nextStep).toBe('BANK_STATEMENT_UPLOAD');
  });

  it('advances to DATA_CONFIRMATION after 3rd statement', async () => {
    const result = await handleBuyerMessage(
      imageMsg(),
      stateAt('BANK_STATEMENT_UPLOAD', { context: { bank_statements_received: 2 } }),
    );
    expect(result.nextStep).toBe('DATA_CONFIRMATION');
  });

  it('advances to DATA_CONFIRMATION when buyer says done (with ≥1 statement)', async () => {
    const result = await handleBuyerMessage(
      textMsg('done'),
      stateAt('BANK_STATEMENT_UPLOAD', { context: { bank_statements_received: 1 } }),
    );
    expect(result.nextStep).toBe('DATA_CONFIRMATION');
  });

  it('stays at BANK_STATEMENT_UPLOAD when buyer says done with 0 statements', async () => {
    const result = await handleBuyerMessage(
      textMsg('done'),
      stateAt('BANK_STATEMENT_UPLOAD', { context: { bank_statements_received: 0 } }),
    );
    expect(result.nextStep).toBe('BANK_STATEMENT_UPLOAD');
  });
});

describe('Buyer flow — DATA_CONFIRMATION', () => {
  it('shows data when data_shown is false', async () => {
    const result = await handleBuyerMessage(
      textMsg(''),
      stateAt('DATA_CONFIRMATION', { context: { data_shown: false, extracted_data: { name: 'Test' } } }),
    );
    expect(result.nextStep).toBe('DATA_CONFIRMATION');
    const textResponse = result.responses.find((r) => r.type === 'text');
    expect(textResponse).toBeDefined();
  });

  it('advances to SELLER_DETAILS when buyer confirms', async () => {
    const result = await handleBuyerMessage(
      buttonMsg('confirm_yes', 'Yes, correct'),
      stateAt('DATA_CONFIRMATION', { context: { data_shown: true } }),
    );
    expect(result.nextStep).toBe('SELLER_DETAILS');
  });

  it('stays at DATA_CONFIRMATION when buyer says something is wrong', async () => {
    const result = await handleBuyerMessage(
      buttonMsg('confirm_no', 'No, something is wrong'),
      stateAt('DATA_CONFIRMATION', { context: { data_shown: true } }),
    );
    expect(result.nextStep).toBe('DATA_CONFIRMATION');
  });
});

describe('Buyer flow — SELLER_DETAILS', () => {
  it('accepts +27 format and advances to WAITING_FOR_QUOTE', async () => {
    const result = await handleBuyerMessage(
      textMsg('+27821234567'),
      stateAt('SELLER_DETAILS'),
    );
    expect(result.nextStep).toBe('WAITING_FOR_QUOTE');
  });

  it('accepts 08X format and normalises to 27X', async () => {
    const result = await handleBuyerMessage(
      textMsg('0821234567'),
      stateAt('SELLER_DETAILS'),
    );
    expect(result.nextStep).toBe('WAITING_FOR_QUOTE');
    expect(result.dealUpdate).toBeDefined();
  });

  it('stays at SELLER_DETAILS for invalid phone', async () => {
    const result = await handleBuyerMessage(
      textMsg('not a phone number'),
      stateAt('SELLER_DETAILS'),
    );
    expect(result.nextStep).toBe('SELLER_DETAILS');
  });
});

describe('Buyer flow — WAITING_FOR_QUOTE', () => {
  it('stays at WAITING_FOR_QUOTE for any input', async () => {
    const result = await handleBuyerMessage(
      textMsg('any message'),
      stateAt('WAITING_FOR_QUOTE'),
    );
    expect(result.nextStep).toBe('WAITING_FOR_QUOTE');
  });
});

describe('Buyer flow — QUOTE_REVIEW', () => {
  it('advances to CONTRACT_SIGNING on accept', async () => {
    const result = await handleBuyerMessage(
      buttonMsg('quote_accept', 'Accept quote'),
      stateAt('QUOTE_REVIEW'),
    );
    expect(result.nextStep).toBe('CONTRACT_SIGNING');
    expect(result.dealUpdate?.status).toBe('quote_accepted');
  });

  it('advances to DONE on decline', async () => {
    const result = await handleBuyerMessage(
      buttonMsg('quote_decline', 'Decline'),
      stateAt('QUOTE_REVIEW'),
    );
    expect(result.nextStep).toBe('DONE');
    expect(result.dealUpdate?.status).toBe('quote_declined');
  });

  it('shows quote again on ambiguous input', async () => {
    const result = await handleBuyerMessage(
      textMsg('hmm'),
      stateAt('QUOTE_REVIEW', { context: { quote_data: { loanAmount: 100000, interestRate: 12, termMonths: 60, monthlyInstalment: 2000, totalRepayable: 120000, expiresAt: '2026-12-31' } } }),
    );
    expect(result.nextStep).toBe('QUOTE_REVIEW');
  });
});

describe('Buyer flow — CONTRACT_SIGNING', () => {
  it('advances to DONE when buyer confirms signed', async () => {
    const result = await handleBuyerMessage(
      textMsg('signed'),
      stateAt('CONTRACT_SIGNING'),
    );
    expect(result.nextStep).toBe('DONE');
    expect(result.dealUpdate?.status).toBe('contract_signed');
  });

  it('stays at CONTRACT_SIGNING on other input', async () => {
    const result = await handleBuyerMessage(
      textMsg('I have a question'),
      stateAt('CONTRACT_SIGNING'),
    );
    expect(result.nextStep).toBe('CONTRACT_SIGNING');
  });
});

describe('Buyer flow — DONE', () => {
  it('stays at DONE for any input', async () => {
    const result = await handleBuyerMessage(textMsg('hello'), stateAt('DONE'));
    expect(result.nextStep).toBe('DONE');
  });
});
