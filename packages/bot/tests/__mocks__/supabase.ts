/**
 * In-memory Supabase mock used by all bot tests.
 * Holds conversation_state rows in a Map keyed by phone.
 */

import { vi } from 'vitest';
import type { ConversationStateRow } from '../../src/state/conversation.js';

// In-memory store for conversation_state rows
const stateStore = new Map<string, ConversationStateRow>();
// In-memory store for ops_tasks
const tasksStore: unknown[] = [];

/** Reset all stores between tests. */
export function resetMockStores(): void {
  stateStore.clear();
  tasksStore.length = 0;
}

/** Seed a conversation state row directly (bypasses the service layer). */
export function seedState(row: ConversationStateRow): void {
  stateStore.set(row.phone, { ...row });
}

/** Inspect stored state (test helper). */
export function getStoredState(phone: string): ConversationStateRow | undefined {
  return stateStore.get(phone);
}

/** Inspect ops tasks (test helper). */
export function getStoredTasks(): unknown[] {
  return tasksStore;
}

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

type SupabaseQueryChain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
};

function makeChain(tableName: string): SupabaseQueryChain {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock builder
  const chain: any = {};

  chain.select = vi.fn(() => chain);
  chain.neq = vi.fn(() => chain);
  chain.lt = vi.fn(() => chain);

  chain.eq = vi.fn((col: string, val: string) => {
    // Attach context for terminal calls
    chain._filter = { col, val };
    return chain;
  });

  chain.maybeSingle = vi.fn(() => {
    if (tableName === 'conversation_state' && chain._filter?.col === 'phone') {
      const row = stateStore.get(chain._filter.val as string);
      return Promise.resolve({ data: row ?? null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });

  chain.upsert = vi.fn((record: ConversationStateRow) => {
    if (tableName === 'conversation_state') {
      stateStore.set(record.phone, { ...record });
    }
    return Promise.resolve({ error: null });
  });

  chain.delete = vi.fn(() => {
    if (tableName === 'conversation_state' && chain._filter?.col === 'phone') {
      stateStore.delete(chain._filter.val as string);
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

  return chain as SupabaseQueryChain;
}

export const mockSupabaseClient = {
  from: vi.fn((tableName: string) => makeChain(tableName)),
};

// ---------------------------------------------------------------------------
// Mock getSupabaseClient
// ---------------------------------------------------------------------------

vi.mock('../../src/services/supabase.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/services/supabase.js')>();
  return {
    ...original,
    getSupabaseClient: vi.fn(() => mockSupabaseClient),
    createOpsTask: vi.fn(async (record: unknown) => {
      tasksStore.push(record);
      return { id: 'mock-task-id', ...record as object };
    }),
  };
});
