/**
 * Mobile / narrow-viewport smoke tests. Runs on the iPhone 13 device profile.
 */
import { test, expect } from '@playwright/test'

test.describe('Mobile viewport', () => {
  test('dashboard renders without horizontal scrollbar overflow', async ({ page }) => {
    await page.goto('/')
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth)
    const innerWidth = await page.evaluate(() => window.innerWidth)
    // Within 1px tolerance for sub-pixel rendering
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1)
  })

  test('sidebar / primary nav is reachable on narrow viewport', async ({ page }) => {
    await page.goto('/')
    // Even on narrow viewport the wordmark should be visible
    await expect(page.getByText('Tec').first()).toBeVisible()
  })

  test('login page is mobile-friendly', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/login')
    await expect(page.getByLabel(/work email/i)).toBeVisible()
  })
})
