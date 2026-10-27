import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

const LOGIN_URL_RE = /\/login/

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

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByLabel('Répéter le mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: "Créer l'utilisateur" }).click()

  await expect(page).toHaveURL(LOGIN_URL_RE, { timeout: 15_000 })
})
