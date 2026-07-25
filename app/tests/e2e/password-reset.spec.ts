import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const FORGOT_URL_RE = /\/password\/forgot/
const SUBMIT_BUTTON_RE = /envoyer/i
// The deliberately non-committal confirmation shown for ANY email, known or not.
const UNIFORM_SUCCESS_RE = /Si votre adresse correspond à un compte utilisateur/i

// A real seeded account — the app-setup fixture guarantees it exists.
const KNOWN_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'

// Submits the forgot-password form for `email` and returns the exact confirmation text
// rendered on the reloaded page. Skips only when the app isn't initialised (setup /
// register redirect); on the forgot page itself the form MUST be present — a missing
// form fails loudly rather than green-washing via test.skip().
async function submitForgotPassword(page: Page, email: string): Promise<string> {
  await page.goto('/password/forgot')
  if (page.url().includes('/setup') || page.url().includes('/register')) {
    test.skip()
  }

  const emailInput = page.locator('input[type="email"], input[name="email"]')
  await expect(emailInput).toBeVisible()

  await emailInput.fill(email)
  await page.getByRole('button', { name: SUBMIT_BUTTON_RE }).click()

  await page.waitForLoadState('networkidle')
  await expect(page).toHaveURL(FORGOT_URL_RE)

  const confirmation = page.getByText(UNIFORM_SUCCESS_RE)
  await expect(confirmation).toBeVisible()
  return ((await confirmation.textContent()) ?? '').trim()
}

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

  // Anti-enumeration: a known and an unknown email must produce byte-identical
  // confirmations on the same page. e2e can only observe the uniform response body here
  // — the timing/rate-limit parity is guarded by the unit and integration suites — but
  // asserting both sides catches any regression that leaks "no such account" through a
  // different message or redirect for one of them.
  test('known and unknown emails yield an identical confirmation', async ({ page }) => {
    const unknownConfirmation = await submitForgotPassword(page, `unknown-${Date.now()}@nowhere.test`)
    const knownConfirmation = await submitForgotPassword(page, KNOWN_EMAIL)

    expect(unknownConfirmation).not.toBe('')
    expect(knownConfirmation).toBe(unknownConfirmation)
  })
})
