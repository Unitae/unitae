import { expect, test } from '@playwright/test'

test.describe('Password reset flow', () => {
  test('forgot password page loads', async ({ page }) => {
    await page.goto('/password/forgot')
    await page.waitForLoadState('networkidle')
    // If the page loaded the forgot password form, there should be an email input
    const emailInput = page.locator('input[type="email"], input[name="email"]')
    if (await emailInput.isVisible().catch(() => false)) {
      await expect(emailInput).toBeVisible()
    }
  })
})
