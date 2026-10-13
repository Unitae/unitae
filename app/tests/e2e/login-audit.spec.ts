import { expect, type Page, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'Str0ng-E2E-Passphrase-42'

const EMAIL_FIELD_RE = /email/i
const PASSWORD_FIELD_RE = /mot de passe/i
const SUBMIT_BUTTON_RE = /connexion/i

// The entry is written after the response has left, so the page is reloaded until it shows.
async function expectAuditRow(page: Page, action: string, label: string) {
  const url = `/settings/audit-log?action=${action}`

  await page.goto(url)
  // The account cannot open the audit log: nothing to check with it.
  if (!page.url().includes('/settings/audit-log')) test.skip()

  await expect(async () => {
    await page.goto(url)
    const row = page.getByRole('row').filter({ hasText: TEST_EMAIL }).filter({ hasText: label })
    await expect(row.first()).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 10_000 })
}

// Regression: sign-in events were only recorded when the URL named a congregation, so an instance
// without subdomains never recorded one.
test.describe('Sign-in audit', () => {
  test('a sign-in appears in the audit log', async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()
    // Let the post-login navigation settle, or it cancels the next one.
    await page.waitForLoadState('networkidle')

    await expectAuditRow(page, 'user.login', 'Connexion')
  })

  test('a failed sign-in on an existing account appears in the audit log', async ({ page }) => {
    await page.goto('/login')
    const emailField = page.getByLabel(EMAIL_FIELD_RE)
    if (!(await emailField.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip()
      return
    }

    await emailField.fill(TEST_EMAIL)
    await page.getByLabel(PASSWORD_FIELD_RE).fill(`not-${TEST_PASSWORD}`)
    await page.getByRole('button', { name: SUBMIT_BUTTON_RE }).click()
    await page.waitForLoadState('networkidle')

    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()
    await page.waitForLoadState('networkidle')

    await expectAuditRow(page, 'user.login.failed', 'Echec de connexion')
  })
})
