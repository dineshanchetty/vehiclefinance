/**
 * Authenticated dashboard happy-paths. Requires E2E_ADMIN_TOKEN.
 */
import { test, expect } from '@playwright/test'

test.describe('Dashboard (authenticated)', () => {
  test('sidebar shows the Claimtec wordmark, FinOps subtitle, and primary nav', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Tec').first()).toBeVisible()
    await expect(page.getByText('FinOps')).toBeVisible()
    await expect(page.getByRole('link', { name: /^dashboard$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^deals$/i })).toBeVisible()
  })

  test('dashboard renders KPI cards', async ({ page }) => {
    await page.goto('/')
    // The Dashboard.tsx renders at least 3 stat cards (NEW / IN REVIEW / APPROVED / DECLINED)
    await expect(page.locator('text=/new/i').first()).toBeVisible()
  })

  test('clicking Deals navigates to /deals', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /^deals$/i }).click()
    await expect(page).toHaveURL(/\/deals(\?|$)/)
  })

  test('clicking Audit Log navigates to /audit', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /audit log/i }).click()
    await expect(page).toHaveURL(/\/audit/)
  })

  test('sidebar search filters nav items', async ({ page }) => {
    await page.goto('/')
    await page.getByPlaceholder(/search/i).fill('audit')
    await expect(page.getByRole('link', { name: /audit log/i })).toBeVisible()
    // Dashboard link should be filtered out
    await expect(page.getByRole('link', { name: /^dashboard$/i })).toHaveCount(0)
  })

  test('Queues group expands when clicked', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /queues/i }).click()
    await expect(page.getByRole('link', { name: /doc review/i })).toBeVisible()
  })

  test('Queue link navigates to the correct queue route', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /queues/i }).click()
    await page.getByRole('link', { name: /doc review/i }).click()
    await expect(page).toHaveURL(/\/queue\/Q_BUYER_DOC_REVIEW/)
  })

  test('User initials render in the profile footer', async ({ page }) => {
    await page.goto('/')
    // Profile footer shows the user's initials inside a circular avatar
    const sidebar = page.locator('aside')
    await expect(sidebar.locator('text=/^[A-Z]{1,2}$/').last()).toBeVisible()
  })
})
