/**
 * Global test setup: mock all external services so tests never require
 * live credentials (Supabase, Dialog360, BulkSMS, SendGrid, Anthropic).
 */

import { vi } from 'vitest';

// ── Supabase ─────────────────────────────────────────────────────────────────

// In-memory conversation_state store
const stateStore = new Map<string, Record<string, unknown>>();
export { stateStore };

// In-memory ops_tasks store
const tasksStore: unknown[] = [];
export { tasksStore };

export function resetStores(): void {
  stateStore.clear();
  tasksStore.length = 0;
}

const makeChain = (tableName: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock builder
  const chain: any = {};
  chain._filter = null as null | { col: string; val: string };

  chain.select = vi.fn(() => chain);
  chain.neq = vi.fn(() => chain);
  chain.lt = vi.fn(() => chain);

  chain.eq = vi.fn((col: string, val: string) => {
    chain._filter = { col, val };
    return chain;
  });

  chain.maybeSingle = vi.fn(() => {
    if (tableName === 'conversation_state' && chain._filter?.col === 'phone') {
      const row = stateStore.get(chain._filter.val) ?? null;
      return Promise.resolve({ data: row, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });

  chain.upsert = vi.fn((record: Record<string, unknown>) => {
    if (tableName === 'conversation_state') {
      stateStore.set(record['phone'] as string, { ...record });
    }
    return Promise.resolve({ error: null });
  });

  chain.delete = vi.fn(() => {
    if (tableName === 'conversation_state' && chain._filter?.col === 'phone') {
      stateStore.delete(chain._filter.val);
    }
    return chain;
  });

  chain.update = vi.fn(() => chain);

  chain.insert = vi.fn((record: unknown) => {
    if (tableName === 'ops_tasks') {
      tasksStore.push(record);
    }
    return chain;
  });

  chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));

  return chain;
};

vi.mock('../src/services/supabase.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/services/supabase.js')>();
  const mockClient = { from: vi.fn((t: string) => makeChain(t)) };
  return {
    ...original,
    getSupabaseClient: vi.fn(() => mockClient),
    createOpsTask: vi.fn(async (record: unknown) => {
      tasksStore.push(record);
      return { id: 'mock-task-id', ...(record as object) };
    }),
  };
});

// ── Dialog360 ────────────────────────────────────────────────────────────────

vi.mock('../src/services/dialog360.js', () => ({
  sendTextMessage: vi.fn(async () => undefined),
  sendInteractiveMessage: vi.fn(async () => undefined),
  sendDocumentMessage: vi.fn(async () => undefined),
  sendImageMessage: vi.fn(async () => undefined),
  downloadMedia: vi.fn(async () => ({ buffer: Buffer.from(''), mimeType: 'image/jpeg' })),
  downloadAndStoreMedia: vi.fn(async (_id: string, path: string) => ({
    publicUrl: `https://storage.example.com/${path}`,
    mimeType: 'image/jpeg',
  })),
}));

// ── BulkSMS ──────────────────────────────────────────────────────────────────

vi.mock('../src/services/bulksms.js', () => ({
  sendSMS: vi.fn(async () => undefined),
}));

// ── SendGrid ─────────────────────────────────────────────────────────────────

vi.mock('../src/services/sendgrid.js', () => ({
  sendEmail: vi.fn(async () => undefined),
  sendTemplateEmail: vi.fn(async () => undefined),
}));

// ── Anthropic ────────────────────────────────────────────────────────────────

vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn(async () => ({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'Mocked agent response' }],
  }));
  return {
    default: class Anthropic {
      messages = { create: mockCreate };
    },
  };
});
