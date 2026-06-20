/**
 * Unauthenticated journeys — login page, redirect-when-not-signed-in,
 * magic-link UX, and error states. These run with a fresh browser context
 * (no storageState).
 */
import { test, expect } from '@playwright/test'

test.describe('Unauthenticated dashboard', () => {
  test('any protected route redirects to /login', async ({ page }) => {
    await page.goto('/deals')
    await expect(page).toHaveURL(/\/login/)
  })

  test('audit log route redirects to /login', async ({ page }) => {
    await page.goto('/audit')
    await expect(page).toHaveURL(/\/login/)
  })

  test('queue page redirects to /login', async ({ page }) => {
    await page.goto('/queue/Q_BUYER_DOC_REVIEW')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page renders the Claimtec wordmark + FinOps subtitle', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('Tec')).toBeVisible()
    await expect(page.getByText(/FinOps · Operations Portal/i)).toBeVisible()
  })

  test('login page has a disabled submit when email is empty', async ({ page }) => {
    await page.goto('/login')
    const btn = page.getByRole('button', { name: /send magic link/i })
    await expect(btn).toBeDisabled()
  })

  test('login page enables submit after typing a valid email', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/work email/i).fill('ari@claimtec.co.za')
    await expect(page.getByRole('button', { name: /send magic link/i })).toBeEnabled()
  })

  test('HTML title is "Claimtec FinOps"', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/Claimtec FinOps/)
  })

  test('login page is keyboard-accessible (tab to email + button)', async ({ page }) => {
    await page.goto('/login')
    await page.keyboard.press('Tab')
    const email = page.getByLabel(/work email/i)
    await expect(email).toBeFocused()
    await email.fill('ari@claimtec.co.za')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: /send magic link/i })).toBeFocused()
  })
})
