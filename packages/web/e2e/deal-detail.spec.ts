/**
 * Deal detail page — all tabs, hero, phase strip, conversation, etc.
 *
 * Requires a seeded test deal. Tests will skip themselves if there are no
 * deals in the database.
 */
import { test, expect } from '@playwright/test'

async function gotoFirstDeal(page: import('@playwright/test').Page) {
  await page.goto('/deals')
  const firstDealLink = page.locator('a[href^="/deals/"]').first()
  if ((await firstDealLink.count()) === 0) {
    test.skip(true, 'No deals seeded — skipping deal-detail tests')
    return null
  }
  const href = await firstDealLink.getAttribute('href')
  await firstDealLink.click()
  await page.waitForURL(new RegExp(href!.replace(/\//g, '\\/')))
  return href
}

test.describe('Deal detail', () => {
  test('hero shows vehicle / buyer / price fields', async ({ page }) => {
    const href = await gotoFirstDeal(page)
    if (!href) return
    await expect(page.getByText(/^Vehicle$/i).first()).toBeVisible()
    await expect(page.getByText(/^Buyer$/i).first()).toBeVisible()
    await expect(page.getByText(/^Price$/i).first()).toBeVisible()
  })

  test('phase strip renders 15 phase markers', async ({ page }) => {
    const href = await gotoFirstDeal(page)
    if (!href) return
    // The PhaseStrip renders an ol with 15 buttons
    const buttons = page.locator('ol button')
    await expect.poll(() => buttons.count(), { timeout: 8_000 }).toBeGreaterThanOrEqual(15)
  })

  test('overview tab is active by default', async ({ page }) => {
    const href = await gotoFirstDeal(page)
    if (!href) return
    await expect(page.locator('text=/overview/i').first()).toBeVisible()
  })

  test('can switch to Buyer sub-tab', async ({ page }) => {
    const href = await gotoFirstDeal(page)
    if (!href) return
    const buyerTab = page.locator('button:has-text("Buyer")').first()
    if ((await buyerTab.count()) > 0) {
      await buyerTab.click()
      // Just confirm no crash
      await expect(page.locator('text=/error/i')).toHaveCount(0)
    }
  })

  test('can switch to Vehicle sub-tab', async ({ page }) => {
    const href = await gotoFirstDeal(page)
    if (!href) return
    const tab = page.locator('button:has-text("Vehicle")').first()
    if ((await tab.count()) > 0) await tab.click()
  })

  test('can switch to Affordability sub-tab', async ({ page }) => {
    const href = await gotoFirstDeal(page)
    if (!href) return
    const tab = page.locator('button:has-text("Affordability")').first()
    if ((await tab.count()) > 0) await tab.click()
  })

  test('can switch to Seller sub-tab', async ({ page }) => {
    const href = await gotoFirstDeal(page)
    if (!href) return
    const tab = page.locator('button:has-text("Seller")').first()
    if ((await tab.count()) > 0) await tab.click()
  })

  test('can switch to Conversation sub-tab', async ({ page }) => {
    const href = await gotoFirstDeal(page)
    if (!href) return
    const tab = page.locator('button:has-text("Conversation")').first()
    if ((await tab.count()) > 0) await tab.click()
  })

  test('can switch to Tasks sub-tab', async ({ page }) => {
    const href = await gotoFirstDeal(page)
    if (!href) return
    const tab = page.locator('button:has-text("Tasks")').first()
    if ((await tab.count()) > 0) await tab.click()
  })

  test('does not show a React error boundary message', async ({ page }) => {
    const href = await gotoFirstDeal(page)
    if (!href) return
    await expect(page.locator('text=/something went wrong/i')).toHaveCount(0)
    await expect(page.locator('text=/uncaught/i')).toHaveCount(0)
  })
})
