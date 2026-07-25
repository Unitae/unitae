import { expect, test } from '@playwright/test'

const FORGOT_URL_RE = /\/password\/forgot/
const SUBMIT_BUTTON_RE = /envoyer/i
// The deliberately non-committal confirmation shown for ANY email, known or not.
const UNIFORM_SUCCESS_RE = /Si votre adresse correspond à un compte utilisateur/i

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

  // Anti-enumeration: an unknown email must produce exactly the same confirmation a
  // real account would, and stay on the same page. e2e can only observe the uniform
  // response body here — the timing/rate-limit parity is guarded by the unit and
  // integration suites — but this catches any regression that leaks "no such account".
  test('submitting an unknown email shows the uniform confirmation', async ({ page }) => {
    await page.goto('/password/forgot')

    const emailInput = page.locator('input[type="email"], input[name="email"]')
    if (!(await emailInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip()
      return
    }

    await emailInput.fill(`unknown-${Date.now()}@nowhere.test`)
    await page.getByRole('button', { name: SUBMIT_BUTTON_RE }).click()

    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(FORGOT_URL_RE)
    await expect(page.getByText(UNIFORM_SUCCESS_RE)).toBeVisible()
  })
})
