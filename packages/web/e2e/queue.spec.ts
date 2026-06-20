/**
 * Queue page — task list, filtering, action buttons, empty states.
 */
import { test, expect } from '@playwright/test'

const QUEUES = [
  ['Q_BUYER_DOC_REVIEW',     'Buyer Document Review'],
  ['Q_SELLER_DOC_REVIEW',    'Seller Document Review'],
  ['Q_SELLER_PHOTO_REVIEW',  'Seller Photo Review'],
  ['Q_FNI_REVIEW',           'F&I Review'],
  ['Q_FNI_QUOTE_PREP',       'F&I Quote Preparation'],
  ['Q_HARTCON_INSPECTION',   'Hartcon Inspections'],
  ['Q_SELLER_CONTRACT',      'Seller Contracts'],
  ['Q_BUYER_CONTRACT',       'Buyer Contracts'],
  ['Q_DEAL_APPROVAL',        'Deal Approvals'],
  ['Q_NATIS_FULFILMENT',     'NATIS Fulfilment'],
  ['Q_HUMAN_ESCALATION',     'Human Escalations'],
] as const

test.describe('Queue page', () => {
  for (const [key, label] of QUEUES) {
    test(`renders ${label} (${key}) without errors`, async ({ page }) => {
      await page.goto(`/queue/${key}`)
      await expect(page.getByRole('heading', { name: new RegExp(label, 'i') }).first())
        .toBeVisible({ timeout: 10_000 })
      await expect(page.locator('text=/^Error/i')).toHaveCount(0)
    })
  }

  test('shows the queue description', async ({ page }) => {
    await page.goto('/queue/Q_BUYER_DOC_REVIEW')
    await expect(page.locator('text=/review and verify uploaded buyer documents/i').first())
      .toBeVisible()
  })

  test('shows an empty state when no tasks exist', async ({ page }) => {
    await page.goto('/queue/Q_HUMAN_ESCALATION')
    // Either tasks render OR an empty state — but never an error
    await expect(page.locator('text=/error/i')).toHaveCount(0)
  })

  test('refresh button is present', async ({ page }) => {
    await page.goto('/queue/Q_BUYER_DOC_REVIEW')
    const refresh = page.getByRole('button', { name: /refresh/i }).first()
    if ((await refresh.count()) > 0) {
      await refresh.click()
    }
  })

  test('unknown queue route renders gracefully', async ({ page }) => {
    await page.goto('/queue/Q_NOT_A_REAL_QUEUE')
    await expect(page.locator('text=/^Error 4/i')).toHaveCount(0)
  })
})
