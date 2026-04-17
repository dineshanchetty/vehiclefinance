# Phase 3 — Web portal live data (Worker brief)

Your job: replace every mock array in the web portal with real Supabase
queries. After this phase an ops agent can sign in, see the real deal
pipeline, open any deal, review documents / photos / contracts, assign
tasks, and mark audit events — all backed by the live DB.

## Prerequisites in the repo when you start

- Phase 2 has landed: `AuthProvider`, `useSession`, `useProfile`,
  `<ProtectedRoute>`, `<LoginPage>`, and RLS policies exist.
- `packages/shared` exports every table row type you need.
- You can assume the staging Supabase project is reachable via `VITE_SUPABASE_URL`
  and `VITE_SUPABASE_ANON_KEY`.

## Absolute non-negotiables

- Work in your isolated worktree; commit + push your branch.
- Delete every hardcoded mock array. The mock fallback in `DealList.tsx`
  must go — if the fetch fails, render an error state, not mock data.
- Do not introduce a new data-fetching library. Use the Supabase JS client
  directly (swr/react-query are NOT allowed without discussion).
- All queries must go through typed helpers; do not `.from('deals')` raw in components.
- Every page must have loading / error / empty states.

## Deliverables

### 3.1 Query helpers: `packages/web/src/lib/queries.ts`

Typed helper functions returning `Promise<{ data, error }>`:

```
listDeals({ status?, assigned_to?, q?, limit, cursor })
getDeal(id) // with joined buyer, seller, vehicle
listDocuments(dealId)
listExtractionResults(documentId)
listPhotos(photoSetId)
getVehicleEvaluation(dealId)
listQuotes(dealId)
listContracts(dealId)
listAuditEvents(dealId)
listTasks({ queue?, status?, assigned_to? })
claimTask(taskId, userId)
completeTask(taskId, notes?)
escalateTask(taskId, reason)
updateDealStatus(dealId, status)
listAuditFeed({ event_type?, limit, cursor })
```

Every function uses types from `@vehiclefinance/shared`. Joins via
`select('*, buyer:buyers(*), seller:sellers(*), vehicle:vehicles(*)')`.

### 3.2 `packages/web/src/pages/DealList.tsx`

- Delete the `MOCK_DEALS` array.
- Use `listDeals(...)` with URL-synced search/filter/sort state.
- Table columns: deal_number, status (badge), buyer, vehicle, updated_at, assigned.
- Click row → `/deals/:id`.
- Pagination: cursor-based or page numbers, whichever fits 50-row pages.
- Loading skeleton row, empty state, error state.

### 3.3 `packages/web/src/pages/DealDetail.tsx`

- Delete all `MOCK_*` consts.
- Parallel-fetch: deal (with joins) + documents + extraction results +
  photo set + photos + evaluation + quotes + contracts + signature events +
  tasks + audit events.
- Sections:
  - Header: deal_number, status badge, timeline, actions (Approve / Reject / Reassign / Escalate).
  - Buyer card + Seller card.
  - Vehicle card + photo grid (9 mandatory angles + optional).
  - Quick evaluation panel (condition band, confidence, requires_manual_review pill).
  - Documents list with extraction confidence chips.
  - Quote card, contracts card.
  - Task sidebar (open tasks for this deal).
  - Audit timeline (collapsible).
- Each mutation goes through the helpers; after mutation, refresh the relevant section.

### 3.4 `packages/web/src/pages/QueuePage.tsx`

- Delete `MOCK_TASKS`.
- Use `listTasks({ queue: selectedQueue })` with the 14 queue names from
  `@vehiclefinance/shared` constants.
- Show a sidebar of queue names with counts (separate lightweight query).
- For each task: claim / complete / escalate buttons.
- **Supabase Realtime subscription** on `tasks` table filtered by queue; new
  rows appear at the top without refresh. Clean up the subscription on
  unmount.

### 3.5 `packages/web/src/pages/AuditLog.tsx`

- Live, filterable feed combining `audit_events` + `audit_logs`.
- Filter by event_type, deal_id (when on a deal context).
- Infinite scroll (or "Load more").

### 3.6 Realtime & stale-data helpers

- `packages/web/src/lib/realtime.ts`: a `useRealtimeTable<T>(table, filter, onInsert)` hook.

### 3.7 Tests

- Vitest + React Testing Library.
- Add `vitest` config + basic setup.
- At minimum, one happy-path test per page that mocks the Supabase client
  and asserts the main data renders.

### 3.8 Minor UI

- Status badge component that colour-codes by deal_status category.
- Avatar / initials component for assigned_to (just initials for now).

## Exit criteria

1. `rg '(MOCK_|mock deals)' packages/web/src` returns nothing relevant.
2. Every page renders live data in dev when `VITE_SUPABASE_*` are set.
3. Error states, loading states, empty states all present.
4. Realtime subscription on QueuePage cleans up on unmount (no leak).
5. `queries.ts` is the single surface between components and Supabase.
6. Vitest tests pass (`pnpm --filter @vehiclefinance/web test`).
7. `PHASE_3_REPORT.md` in `docs/uat/phase-briefs/`.

## Process

1. Read this brief + Phase 2 report for the auth surface shape.
2. Read every current `packages/web/src/pages/*.tsx` so you know what to replace.
3. Build `queries.ts` first, then rewrite pages one by one.
4. Add Vitest, write tests.
5. Commit + push + report.
