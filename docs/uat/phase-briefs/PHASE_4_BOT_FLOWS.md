# Phase 4 — Bot flow completion (Worker brief)

Your job: finish the buyer and seller WhatsApp state machines. Every state
must persist, every transition must be idempotent, and a user who drops
off mid-conversation must resume where they left when they message again.

## Absolute non-negotiables

- Work in your isolated worktree; commit + push.
- You touch ONLY `packages/bot/**` and the bot's `tests/` (you can create a
  new directory). Do NOT touch migrations, web, or api packages.
- `conversation_messages` table already exists (from Phase 0 migration).
  You may add a `conversation_state` table as a new migration file ONLY
  if you scope it narrowly and name it `20260417010000_conversation_state.sql`.
- Every Claude agent call must be resumable. No in-memory state.

## Current state to pick up from

- Express entrypoint: `packages/bot/src/index.ts`.
- Dialog360 webhook handler: `packages/bot/src/handlers/webhook.ts`.
- Claude agent tools: `packages/bot/src/agent/tools.ts` (25 tools defined) +
  `packages/bot/src/agent/tool-handlers.ts`.
- Flows: `packages/bot/src/flows/buyer-flow.ts`, `packages/bot/src/flows/seller-flow.ts`.
  These have state-machine scaffolding; your job is to finish each state.
- Services: `packages/bot/src/services/{bulksms,sendgrid,dialog360}.ts`.

## Deliverables

### 4.1 Persistent conversation state

Add migration `packages/api/supabase/migrations/20260417010000_conversation_state.sql`:

```sql
CREATE TABLE IF NOT EXISTS conversation_state (
  phone              text PRIMARY KEY,
  deal_id            uuid REFERENCES deals(id) ON DELETE SET NULL,
  party_type         party_type,
  current_flow       text NOT NULL,    -- 'BUYER' | 'SELLER'
  current_state      text NOT NULL,    -- e.g. 'POA_UPLOAD'
  state_context      jsonb NOT NULL DEFAULT '{}',
  last_message_at    timestamptz NOT NULL DEFAULT now(),
  stuck_since        timestamptz,      -- set if no progress for >24h
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_conversation_state_updated_at
  BEFORE UPDATE ON conversation_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_conv_state_deal ON conversation_state(deal_id);
ALTER TABLE conversation_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON conversation_state FOR ALL TO service_role USING (true);
```

Wire a `packages/bot/src/state/conversation.ts` module:

```
loadState(phone) -> ConversationState | null
saveState(phone, state) -> void  // upsert
advance(phone, nextState, ctx?) -> void
markStuckIfIdle(phone, hours=24) -> void
```

### 4.2 Buyer flow — complete every state

Audit each state in `buyer-flow.ts`. For each state:

1. What message prompts does the bot send? (All consent prompts must come
   from a single strings file — `src/flows/strings.ts` — so compliance can
   review them.)
2. What inputs are accepted / expected?
3. What triggers transition to next state?
4. What happens on malformed input? (Retry prompt, help message.)
5. What happens after 3 consecutive malformed inputs? (Escalate to human.)

States to cover (rename if existing code uses different names):
`WELCOME → CONSENT → ID_UPLOAD → POA_UPLOAD → BANK_STATEMENT_UPLOAD →`
`DATA_CONFIRMATION → SELLER_DETAILS → WAITING_FOR_QUOTE →`
`QUOTE_REVIEW → CONTRACT_SIGNING → DONE`.

Each transition must:
- Persist to `conversation_state` before returning.
- Insert into `audit_logs` with a meaningful `event_type`.
- Be idempotent: if the user re-sends a message at the same state, don't
  advance twice.

### 4.3 Seller flow — complete every state

Same treatment as buyer. States:
`WELCOME → CONSENT → ID_UPLOAD → VEHICLE_DOC_UPLOAD → VEHICLE_PHOTOS →`
`PHOTO_SET_COMPLETE → DATA_CONFIRMATION → WAITING_FOR_EVALUATION →`
`SELLER_CONTRACT_PENDING → DONE`.

The `VEHICLE_PHOTOS` state must drive users through the 9 mandatory angles
listed in `@vehiclefinance/shared/constants/MANDATORY_PHOTO_ANGLES`. When the
photo set's `mandatory_received` reaches `mandatory_required`, advance
state to `PHOTO_SET_COMPLETE`.

### 4.4 Timeout / escalation

Background cron (scheduled Supabase Edge Function OR a Node timer if easier
for now, documented): every hour, query `conversation_state` where
`last_message_at < now() - interval '24 hours'` AND `current_state NOT IN (DONE, ESCALATED)`.
For each stuck row, insert a `Q_HUMAN_ESCALATION` task and mark `stuck_since`.

If using a Node timer, document it in the report — we'll promote to a
proper scheduled job later.

### 4.5 Tests — `packages/bot/tests/`

- Create `packages/bot/vitest.config.ts` and add `vitest` dev dependency
  (+ `@testing-library/jest-dom` etc. if needed, keep lean).
- `tests/buyer-flow.test.ts`: unit test each state transition using a
  mocked `conversation_state` module. Assert expected outgoing message
  and next state.
- `tests/seller-flow.test.ts`: same.
- `tests/resume.test.ts`: given a user with state `POA_UPLOAD`, when they
  send a new valid PoA, they advance to `BANK_STATEMENT_UPLOAD` (not back
  to WELCOME).
- `tests/escalation.test.ts`: simulate 3 consecutive malformed inputs →
  expect a `Q_HUMAN_ESCALATION` task creation.

Run with `pnpm --filter @vehiclefinance/bot test`.

### 4.6 Safety improvements

- Any time a flow handler calls Claude with tools, the tool handler must
  wrap DB writes in try/catch and return structured errors to the agent,
  not throw unhandled.
- Add rate limiting on webhook: if a phone sends > 10 messages in 1 minute,
  reply with a throttle message and drop.

## Exit criteria

1. `conversation_state` migration present + idempotent.
2. Every state in buyer-flow + seller-flow has a named handler, no TODO / stubs.
3. Strings centralised in `src/flows/strings.ts`.
4. Resumption works (covered by `resume.test.ts`).
5. Escalation path covered by `escalation.test.ts`.
6. Stuck-user detection documented (mechanism fine to be simple for now).
7. Vitest tests pass (`pnpm --filter @vehiclefinance/bot test`).
8. `PHASE_4_REPORT.md` with state × handler completion grid.

## Process

1. Read this brief + `packages/bot/src/**/*.ts` to understand existing scaffolding.
2. Start with `conversation.ts` module + migration.
3. Rebuild each flow file methodically, one state at a time.
4. Write tests alongside.
5. Commit + push + report.
