/**
 * Auth setup — runs once before all authenticated specs.
 *
 * Strategy: bypass the magic-link flow by setting a Supabase session cookie
 * directly via the JS console. The session comes from the `E2E_ADMIN_TOKEN`
 * env var (JWT issued by the service-role key for the demo admin user).
 *
 * In CI: token is provisioned by the CI job's seed step.
 * Locally: developer sets E2E_ADMIN_TOKEN once after running `pnpm seed:e2e`.
 *
 * When no token is set, the setup is skipped — auth tests fall through to
 * the actual magic-link flow on the unauth project.
 */
import { test as setup, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STATE_PATH = path.join(HERE, '.auth/admin.json')

setup('authenticate as demo admin', async ({ page }) => {
  const token = process.env.E2E_ADMIN_TOKEN
  const refreshToken = process.env.E2E_ADMIN_REFRESH_TOKEN ?? ''

  if (!token) {
    // No token = run unauth specs only. Write an empty state so dependent
    // projects can still resolve their storageState param.
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true })
    fs.writeFileSync(STATE_PATH, JSON.stringify({ cookies: [], origins: [] }))
    setup.skip(true, 'E2E_ADMIN_TOKEN not set — skipping auth setup')
    return
  }

  // Hit the dashboard once so the Supabase client is bootstrapped
  await page.goto('/login')

  // Plant a Supabase session into localStorage (the same key the supabase-js
  // client reads from). Key must match what's in lib/supabase.ts.
  await page.evaluate(({ access_token, refresh_token }) => {
    const session = {
      access_token,
      refresh_token,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'e2e-admin', email: 'e2e-admin@claimtec.co.za' },
    }
    window.localStorage.setItem(
      'vehiclefinance-auth',
      JSON.stringify({ currentSession: session, expiresAt: session.expires_at }),
    )
  }, { access_token: token, refresh_token: refreshToken })

  // Reload + verify we land on the dashboard (not /login)
  await page.goto('/')
  await expect(page).not.toHaveURL(/\/login/)

  await page.context().storageState({ path: STATE_PATH })
})
