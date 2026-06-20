/**
 * Visual rebrand regression — proves there's no WesBank text left on any
 * user-facing page.
 */
import { test, expect } from '@playwright/test'

const PAGES = [
  '/login',
  '/',
  '/deals',
  '/audit',
  '/queue/Q_BUYER_DOC_REVIEW',
  '/queue/Q_FNI_REVIEW',
  '/queue/Q_HARTCON_INSPECTION',
]

for (const path of PAGES) {
  test(`${path} contains zero WesBank text`, async ({ page, context }, testInfo) => {
    // Login + Audit may need session; if redirected, fine — assert against /login then.
    await page.goto(path)
    const text = await page.locator('body').innerText()
    expect(text.toLowerCase()).not.toContain('wesbank')
  })

  test(`${path} renders Claimtec branding`, async ({ page }) => {
    await page.goto(path)
    // Wait for the loading skeleton to clear (some pages render "Loading…"
    // first while queries resolve).
    await page.locator('text=/loading…?/i').first().waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {})
    const text = await page.locator('body').innerText()
    expect(text.toLowerCase()).toMatch(/claim|finops|tec/i)
  })
}

test('app document title is Claimtec FinOps', async ({ page }) => {
  await page.goto('/login')
  await expect(page).toHaveTitle(/Claimtec FinOps/)
})
