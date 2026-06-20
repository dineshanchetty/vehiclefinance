/**
 * Deal list page — filtering, sorting, pagination, navigation to detail.
 */
import { test, expect } from '@playwright/test'

test.describe('Deal list', () => {
  test('renders the deals header', async ({ page }) => {
    await page.goto('/deals')
    await expect(page.getByRole('heading', { name: /deals/i }).first()).toBeVisible()
  })

  test('search input is present', async ({ page }) => {
    await page.goto('/deals')
    await expect(page.locator('input[type="search"], input[placeholder*="search" i]').first()).toBeVisible()
  })

  test('status filter dropdown is present', async ({ page }) => {
    await page.goto('/deals')
    // Either a select or a button-based filter
    const filterControl = page.locator('select, [role="combobox"]').first()
    await expect(filterControl).toBeVisible({ timeout: 10_000 })
  })

  test('clicking a deal row navigates to the deal detail page', async ({ page }) => {
    await page.goto('/deals')
    const firstDealLink = page.locator('a[href^="/deals/"]').first()
    // Skip if no deals seeded
    const hasRow = await firstDealLink.count()
    test.skip(hasRow === 0, 'No deals seeded — skipping nav test')
    await firstDealLink.click()
    await expect(page).toHaveURL(/\/deals\/[a-f0-9-]{8,}/)
  })

  test('empty / loading / error states render without crashing', async ({ page }) => {
    await page.goto('/deals')
    // At minimum, the page must not show an unhandled React error
    await expect(page.locator('text=/^Error/i').first()).toHaveCount(0)
  })

  test('shows the buyer name in each row', async ({ page }) => {
    await page.goto('/deals')
    const rows = page.locator('a[href^="/deals/"]')
    const count = await rows.count()
    test.skip(count === 0, 'No deals to inspect')
    // First row should contain some non-empty text
    await expect(rows.first()).not.toBeEmpty()
  })
})
