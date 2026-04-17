/**
 * Per-state transition tests for the seller flow.
 * All external services are mocked via setup.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';

process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import './setup.js';

import { handleSellerMessage, newSellerState } from '../src/flows/seller-flow.js';
import type { ConversationState, D360Message, VehiclePhotoAngle } from '../src/types/index.js';
import { resetStores } from './setup.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textMsg(body: string): D360Message {
  return {
    from: '27831234567',
    id: 'msg-s1',
    timestamp: Date.now().toString(),
    type: 'text',
    text: { body },
  };
}

function buttonMsg(id: string, title: string): D360Message {
  return {
    from: '27831234567',
    id: 'msg-s2',
    timestamp: Date.now().toString(),
    type: 'interactive',
    interactive: { type: 'button_reply', button_reply: { id, title } },
  };
}

function imageMsg(caption?: string): D360Message {
  return {
    from: '27831234567',
    id: 'msg-s3',
    timestamp: Date.now().toString(),
    type: 'image',
    image: { id: 'media-456', mime_type: 'image/jpeg', sha256: 'def', caption },
  };
}

function stateAt(step: string, extra: Partial<ConversationState> = {}): ConversationState {
  return {
    ...newSellerState('27831234567'),
    current_step: step as ConversationState['current_step'],
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStores();
});

describe('Seller flow — WELCOME', () => {
  it('always transitions to CONSENT', async () => {
    const result = await handleSellerMessage(textMsg('hello'), stateAt('WELCOME'));
    expect(result.nextStep).toBe('CONSENT');
    expect(result.responses.length).toBeGreaterThan(0);
  });
});

describe('Seller flow — CONSENT', () => {
  it('transitions to ID_UPLOAD when seller agrees', async () => {
    const result = await handleSellerMessage(
      buttonMsg('consent_yes', 'Yes, I agree'),
      stateAt('CONSENT'),
    );
    expect(result.nextStep).toBe('ID_UPLOAD');
  });

  it('transitions to DONE when seller declines', async () => {
    const result = await handleSellerMessage(
      buttonMsg('consent_no', 'No, decline'),
      stateAt('CONSENT'),
    );
    expect(result.nextStep).toBe('DONE');
  });

  it('stays at CONSENT on ambiguous text', async () => {
    const result = await handleSellerMessage(textMsg('not sure'), stateAt('CONSENT'));
    expect(result.nextStep).toBe('CONSENT');
  });
});

describe('Seller flow — ID_UPLOAD', () => {
  it('transitions to VEHICLE_DOC_UPLOAD when media received', async () => {
    const result = await handleSellerMessage(imageMsg(), stateAt('ID_UPLOAD'));
    expect(result.nextStep).toBe('VEHICLE_DOC_UPLOAD');
  });

  it('stays at ID_UPLOAD when no media', async () => {
    const result = await handleSellerMessage(textMsg('here it is'), stateAt('ID_UPLOAD'));
    expect(result.nextStep).toBe('ID_UPLOAD');
  });
});

describe('Seller flow — VEHICLE_DOC_UPLOAD', () => {
  it('transitions to VEHICLE_PHOTOS when media received', async () => {
    const result = await handleSellerMessage(imageMsg(), stateAt('VEHICLE_DOC_UPLOAD'));
    expect(result.nextStep).toBe('VEHICLE_PHOTOS');
  });

  it('stays at VEHICLE_DOC_UPLOAD when no media', async () => {
    const result = await handleSellerMessage(
      textMsg('I sent the doc'),
      stateAt('VEHICLE_DOC_UPLOAD'),
    );
    expect(result.nextStep).toBe('VEHICLE_DOC_UPLOAD');
  });
});

describe('Seller flow — VEHICLE_PHOTOS', () => {
  it('stays at VEHICLE_PHOTOS after first photo', async () => {
    const result = await handleSellerMessage(
      imageMsg('front'),
      stateAt('VEHICLE_PHOTOS', { context: { photos_received: [] } }),
    );
    expect(result.nextStep).toBe('VEHICLE_PHOTOS');
    const ctx = result.dealUpdate as Record<string, VehiclePhotoAngle[]> | undefined;
    expect(ctx?.photos_received).toContain('FRONT_VIEW');
  });

  it('advances to DATA_CONFIRMATION after all 9 photos', async () => {
    const allAngles: VehiclePhotoAngle[] = [
      'FRONT_VIEW', 'REAR_VIEW', 'LEFT_SIDE', 'RIGHT_SIDE',
      'FRONT_LEFT_ANGLE', 'FRONT_RIGHT_ANGLE', 'ODOMETER', 'INTERIOR_DASHBOARD',
    ];
    // Send the last photo
    const result = await handleSellerMessage(
      imageMsg('vin'),
      stateAt('VEHICLE_PHOTOS', { context: { photos_received: allAngles } }),
    );
    expect(result.nextStep).toBe('DATA_CONFIRMATION');
  });

  it('stays at VEHICLE_PHOTOS when text received (no media)', async () => {
    const result = await handleSellerMessage(
      textMsg('sending now'),
      stateAt('VEHICLE_PHOTOS', { context: { photos_received: [] } }),
    );
    expect(result.nextStep).toBe('VEHICLE_PHOTOS');
  });
});

describe('Seller flow — DATA_CONFIRMATION', () => {
  it('shows extracted data when data_shown is false', async () => {
    const result = await handleSellerMessage(
      textMsg(''),
      stateAt('DATA_CONFIRMATION', { context: { data_shown: false, extracted_data: { make: 'Toyota' } } }),
    );
    expect(result.nextStep).toBe('DATA_CONFIRMATION');
    const t = result.responses.find((r) => r.type === 'text');
    expect(t).toBeDefined();
  });

  it('advances to WAITING_FOR_CONTRACT on confirmation', async () => {
    const result = await handleSellerMessage(
      buttonMsg('confirm_yes', 'Yes, correct'),
      stateAt('DATA_CONFIRMATION', { context: { data_shown: true } }),
    );
    expect(result.nextStep).toBe('WAITING_FOR_CONTRACT');
  });

  it('resets data_shown on denial', async () => {
    const result = await handleSellerMessage(
      buttonMsg('confirm_no', 'Something is wrong'),
      stateAt('DATA_CONFIRMATION', { context: { data_shown: true } }),
    );
    expect(result.nextStep).toBe('DATA_CONFIRMATION');
  });
});

describe('Seller flow — WAITING_FOR_CONTRACT', () => {
  it('stays at WAITING_FOR_CONTRACT for any input', async () => {
    const result = await handleSellerMessage(
      textMsg('is the contract ready?'),
      stateAt('WAITING_FOR_CONTRACT'),
    );
    expect(result.nextStep).toBe('WAITING_FOR_CONTRACT');
  });
});

describe('Seller flow — CONTRACT_SIGNING', () => {
  it('advances to DONE when seller confirms signed', async () => {
    const result = await handleSellerMessage(
      textMsg('signed'),
      stateAt('CONTRACT_SIGNING'),
    );
    expect(result.nextStep).toBe('DONE');
    expect(result.dealUpdate?.status).toBe('contract_signed');
  });

  it('stays at CONTRACT_SIGNING on other input', async () => {
    const result = await handleSellerMessage(
      textMsg('I have a question'),
      stateAt('CONTRACT_SIGNING'),
    );
    expect(result.nextStep).toBe('CONTRACT_SIGNING');
  });
});

describe('Seller flow — DONE', () => {
  it('stays at DONE for any input', async () => {
    const result = await handleSellerMessage(textMsg('thanks'), stateAt('DONE'));
    expect(result.nextStep).toBe('DONE');
  });
});
