# Testing — Claimtec FinOps

Three test layers. Run them in this order during development.

| Layer | Scope | Tooling | Speed |
|---|---|---|---|
| **Unit** | Components, hooks, lib functions in isolation | Vitest + jsdom + Testing Library | ~3s |
| **E2E (unauth)** | Login + route guards + visual rebrand | Playwright (chromium-unauth project) | ~5s |
| **E2E (auth)** | Dashboard + deal flows + queues + mobile | Playwright (chromium-auth + mobile-smoke) | ~30s, requires E2E_ADMIN_TOKEN |

## Quick reference

```bash
# Type-check + unit + unauth-E2E (CI-equivalent)
pnpm verify

# Same + coverage report
pnpm verify:full
```

## Unit tests

```bash
cd packages/web

pnpm test                 # run once (CI mode)
pnpm test:watch           # watch mode for TDD
pnpm test:coverage        # generate HTML coverage report → coverage/index.html
```

Tests live in `packages/web/src/test/`. Naming: `<ComponentOrLib>.test.tsx` or `.test.ts`.

**Mocking pattern** (matches existing tests):
- Supabase: `vi.mock('../lib/supabase', () => ({ supabase: { ...stub... } }))`
- Auth: `vi.mock('../lib/auth', () => ({ useSession: () => ({...}) }))`
- Realtime: `vi.mock('../lib/realtime', () => ({ useRealtimeTable: vi.fn() }))`

## End-to-end tests

```bash
cd packages/web

pnpm e2e                  # against local pnpm dev (auto-starts)
pnpm e2e:prod             # against the deployed Azure SWA
pnpm e2e:ui               # Playwright UI mode (best for debugging)
pnpm e2e:report           # open last HTML report
```

Tests live in `packages/web/e2e/`. Naming: `<area>.spec.ts`.

**Auth strategy:** Magic-link bypassed by planting a Supabase session token in localStorage. Token comes from `E2E_ADMIN_TOKEN` env. To generate one for local use:

```bash
# Sign in once via the UI as your test admin user, then in browser console:
JSON.parse(localStorage.getItem('vehiclefinance-auth')).currentSession.access_token
# Copy → export E2E_ADMIN_TOKEN=<that-token>
```

When `E2E_ADMIN_TOKEN` is unset, auth-gated specs (dashboard, deal-detail, queue task actions, mobile) skip cleanly. The suite still proves login + visual rebrand work.

## CI

Workflow file: `.github/workflows/ci.yml`

| Job | Triggers | What it runs |
|---|---|---|
| `lint-and-typecheck` | every push + PR | `tsc --noEmit` for shared/bot/web |
| `build` | every push + PR | `pnpm build` all packages |
| `unit-tests` | every push + PR | Bot tests (optional) + Web vitest (required) + coverage artifact |
| `e2e-tests` | every push + PR | Playwright unauth + visual-rebrand specs (chromium) |
| `db-verify` | PRs to main + main pushes | Ephemeral Supabase branch + Deno integration tests |

Web unit-test failures **fail the build**. Coverage uploads as artifact regardless (no threshold yet).

## Coverage targets

Current: **33% statements, 70% branches, 33% functions, 33% lines** (as of 2026-05-25).

Phase 2 prioritised branch coverage on the workflow primitives (taskWorkflows, phaseWorkflows, runTaskAction, auth, ProtectedRoute) and reusable components (Sidebar, SubTabs, StatusBadge, SLAIndicator, PhaseStrip, PhaseTimeline, DealHero). The 67% of statements not yet unit-covered are concentrated in large modals and the 2,400-line DealDetail page — those are covered end-to-end by Playwright.

## Adding a new test

**Unit test** for a component:
```tsx
// src/test/MyComponent.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MyComponent } from '../components/MyComponent'

describe('MyComponent', () => {
  it('renders the expected label', () => {
    render(<MyComponent label="Hello" />)
    expect(screen.getByText(/hello/i)).toBeInTheDocument()
  })
})
```

**E2E test** for a page:
```ts
// e2e/my-page.spec.ts
import { test, expect } from '@playwright/test'

test.describe('My page', () => {
  test('renders the title', async ({ page }) => {
    await page.goto('/my-page')
    await expect(page.getByRole('heading')).toBeVisible()
  })
})
```
