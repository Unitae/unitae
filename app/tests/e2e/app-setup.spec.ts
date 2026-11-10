import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

// The home page itself, signed in: not the sign-in page, not an error page.
const HOME_URL_RE = /^https?:\/\/[^/]+\/$/
const CONGREGATION_NAME_RE = /^nom de l.assemblée$/i
const EMAIL_RE = /^votre e-mail$/i
const CREATE_RE = /^créer et entrer$/i

test('ensure app is initialised', async ({ page }) => {
  const email = E2E_ADMIN_EMAIL
  // This account is created here and logged into by every other spec, so the
  // default MUST match theirs. It must also clear the unified password policy
  // (min length + zxcvbn strength) now enforced on the setup flow — a trivial
  // value like "password" is rejected.
  const password = E2E_ADMIN_PASSWORD

  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  if (!page.url().includes('/setup')) {
    // Already initialised (a local database, or a retry). In CI the admin must then be able to log
    // in: login() throws there instead of letting every other spec skip.
    if (process.env.CI) await login(page, email, password)
    return
  }

  await page.getByLabel(CONGREGATION_NAME_RE).fill('Assemblée E2E')
  await page.getByLabel(EMAIL_RE).fill(email)
  // Exact: the « Afficher le mot de passe » button beside the field is labelled too.
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: CREATE_RE }).click()

  // The admin comes in straight away: no second trip through the sign-in page.
  await expect(page).toHaveURL(HOME_URL_RE, { timeout: 15_000 })
})
