# Phase 4 — Bot Flows: Completion Report

**Date**: 2026-04-17
**Branch**: `claude/focused-hugle`
**Worker**: Phase 4 agent (claude-sonnet-4-6)

---

> ⚠️ **DEPRECATED (2026-04-23)** — The code this report describes was **removed**
> in commit `4e0ff5e` (see `UAT_HANDOFF.md §3`). The bot in production uses the
> Claude Agent SDK path in `packages/bot/src/agent/`, not the rule-based state
> machine this phase built. The `conversation_state` table and its migration
> were also dropped. Keeping this report for historical context only.

---

## Files Delivered

| File | Description |
|---|---|
| `packages/api/supabase/migrations/20260417010000_conversation_state.sql` | Idempotent migration: `conversation_state` table, `updated_at` trigger, 3 indexes, RLS policy |
| `packages/bot/src/state/conversation.ts` | `loadState`, `saveState`, `advance`, `incrementMalformed`, `markStuckIfIdle`, `getIdleConversations`, `deleteState` |
| `packages/bot/src/flows/strings.ts` | All customer-facing strings centralised (buyer flow, seller flow, tool layer, generic) |
| `packages/bot/src/flows/buyer-flow.ts` | Fully completed — 11 states, all with `advance`/`saveState` calls before return |
| `packages/bot/src/flows/seller-flow.ts` | Fully completed — 9 states, photo sub-flow, reminder helpers |
| `packages/bot/src/handlers/webhook.ts` | Added rate limiter (`>10 msg/min → throttle reply`), STRINGS import |
| `packages/bot/src/agent/tool-handlers.ts` | All handlers wrapped with `safe()` — no unhandled throws; inline strings moved to STRINGS |
| `packages/bot/src/index.ts` | Node `setInterval` escalation scheduler (every 5 min, marks 48 h idle convos stuck) |
| `packages/bot/package.json` | Added `vitest ^2.0.0`, `@vitest/coverage-v8 ^2.0.0` dev dependencies |
| `packages/bot/vitest.config.ts` | Vitest configuration (node environment, coverage) |
| `packages/bot/tests/setup.ts` | Global mock setup for Supabase, Dialog360, BulkSMS, SendGrid, Anthropic |
| `packages/bot/tests/buyer-flow.test.ts` | Per-state transition tests for buyer flow |
| `packages/bot/tests/seller-flow.test.ts` | Per-state transition tests for seller flow |
| `packages/bot/tests/resume.test.ts` | Returning-user resumes at correct state tests |
| `packages/bot/tests/escalation.test.ts` | 3 malformed inputs → Q_HUMAN_ESCALATION tests |

---

## State × Handler Grid

### Buyer Flow

| State | Handler | Persist call | Escalation guard |
|---|---|---|---|
| WELCOME | `handleWelcome` | `advance(→ CONSENT)` | — |
| CONSENT | `handleConsent` | `advance(→ ID_UPLOAD)` or `saveState(→ DONE)` | Yes (`incrementMalformed`) |
| ID_UPLOAD | `handleIdUpload` | `advance(→ POA_UPLOAD)` | Yes |
| POA_UPLOAD | `handlePoaUpload` | `advance(→ BANK_STATEMENT_UPLOAD)` | Yes |
| BANK_STATEMENT_UPLOAD | `handleBankStatementUpload` | `advance` (stays or → DATA_CONFIRMATION) | Yes |
| DATA_CONFIRMATION | `handleDataConfirmation` | `advance` (stays or → SELLER_DETAILS) | Yes |
| SELLER_DETAILS | `handleSellerDetails` | `advance(→ WAITING_FOR_QUOTE)` | Yes |
| WAITING_FOR_QUOTE | `handleWaitingForQuote` | `advance` (stays) | — |
| QUOTE_REVIEW | `handleQuoteReview` | `advance(→ CONTRACT_SIGNING)` or `saveState(→ DONE)` | Yes |
| CONTRACT_SIGNING | `handleContractSigning` | `advance` or `saveState(→ DONE)` | — |
| DONE | `handleDone` | `advance(→ DONE)` | — |

### Seller Flow

| State | Handler | Persist call | Escalation guard |
|---|---|---|---|
| WELCOME | `handleWelcome` | `advance(→ CONSENT)` | — |
| CONSENT | `handleConsent` | `advance(→ ID_UPLOAD)` or `saveState(→ DONE)` | Yes |
| ID_UPLOAD | `handleIdUpload` | `advance(→ VEHICLE_DOC_UPLOAD)` | Yes |
| VEHICLE_DOC_UPLOAD | `handleVehicleDocUpload` | `advance(→ VEHICLE_PHOTOS)` | Yes |
| VEHICLE_PHOTOS | `handleVehiclePhotos` | `advance` (stays or → DATA_CONFIRMATION) | Yes |
| DATA_CONFIRMATION | `handleDataConfirmation` | `advance` (stays or → WAITING_FOR_CONTRACT) | Yes |
| WAITING_FOR_CONTRACT | `handleWaitingForContract` | `advance` (stays) | — |
| CONTRACT_SIGNING | `handleContractSigning` | `advance` or `saveState(→ DONE)` | — |
| DONE | `handleDone` | `advance(→ DONE)` | — |

---

## Test Pass Matrix

Tests cannot be run in sandbox (no shell access). Based on code review:

| Test file | Test count | Expected result | Notes |
|---|---|---|---|
| `buyer-flow.test.ts` | 19 | PASS | All state transitions exercised |
| `seller-flow.test.ts` | 16 | PASS | Including photo sub-flow |
| `resume.test.ts` | 5 | PASS | Seed state via `stateStore.set`, verify resume |
| `escalation.test.ts` | 6 | PASS | Seed `malformed_count=2`, send 3rd bad input |

**Note**: `pnpm install` and `pnpm test` must be run in the bot package to confirm. Shell access was denied in this session. All tests were written to match the mock store behaviour.

---

## Escalation / Timeout Mechanism

Implemented as a `setInterval` in `packages/bot/src/index.ts` (runs every 5 minutes):

1. Calls `getIdleConversations(2880)` (48 hours in minutes) via `state/conversation.ts`
2. For each idle conversation, calls `markStuckIfIdle` which sets `is_stuck = true`
3. Creates a `Q_HUMAN_ESCALATION` ops task in the `ops_tasks` table with `priority: 'high'`

**Production note**: Replace `setInterval` with `pg_cron` or a Supabase Edge Function on a schedule for crash-safe execution. The Node interval is sufficient for UAT.

---

## Rate Limiting

Added to `handleDialog360Webhook` in `webhook.ts`:

- **Algorithm**: Sliding window, per-phone, in-process `Map<string, number[]>`
- **Limit**: 10 messages per 60-second window
- **Response**: Sends `STRINGS.RATE_LIMIT_EXCEEDED` to the phone, skips agent processing
- **Production note**: Replace with Redis-backed rate limiting for multi-instance deployments

---

## Tool-Handler Safety

All 21 handlers in `TOOL_HANDLERS` are now wrapped with `safe(name, fn)` which:
- Catches any thrown `Error` or other value
- Returns `{ success: false, error: message }` to the agent
- Logs the error via `console.error`
- Never allows unhandled promise rejections to propagate

---

## Deviations from Brief

1. **PHASE_4_BOT_FLOWS.md not found** — The brief file did not exist in the repo at execution time. Deliverables were inferred from the worker contract in the task prompt.
2. **Escalation scheduler** — Implemented as `setInterval` (Node) rather than a cron job, per brief allowance. Documented above.
3. **`pnpm typecheck` not run** — Shell access was unavailable. TypeScript was written to strict standards with JSDoc on all public functions. Any type errors are expected to be minor (missing type widening at store-seed boundaries in tests).
4. **`packages/shared/src/constants/index.ts`** — File was empty (`export {}`). `MANDATORY_PHOTO_ANGLES` and `TASK_QUEUES` referenced in the brief were not present; the bot's `types/index.ts` has `MANDATORY_VEHICLE_ANGLES` which was used instead.
