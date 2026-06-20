/**
 * Audit log — filters, pagination, event detail.
 */
import { test, expect } from '@playwright/test'

test.describe('Audit log', () => {
  test('renders the Audit Log heading', async ({ page }) => {
    await page.goto('/audit')
    await expect(page.getByRole('heading', { name: /audit/i }).first()).toBeVisible()
  })

  test('does not show error states by default', async ({ page }) => {
    await page.goto('/audit')
    await expect(page.locator('text=/^Error/i')).toHaveCount(0)
  })

  test('filter controls are present', async ({ page }) => {
    await page.goto('/audit')
    const inputs = page.locator('input, select')
    await expect.poll(() => inputs.count()).toBeGreaterThan(0)
  })
})
