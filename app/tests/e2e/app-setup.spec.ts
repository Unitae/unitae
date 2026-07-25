import { expect, test } from '@playwright/test'

const LOGIN_URL_RE = /\/login/

test('ensure app is initialised', async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
  // This account is created here and logged into by every other spec, so the
  // default MUST match theirs. It must also clear the unified password policy
  // (min length + zxcvbn strength) now enforced on the setup flow — a trivial
  // value like "password" is rejected.
  const password = process.env.E2E_USER_PASSWORD ?? 'Str0ng-E2E-Passphrase-42'

  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  if (!page.url().includes('/setup')) return

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByLabel('Répéter le mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: "Créer l'utilisateur" }).click()

  await expect(page).toHaveURL(LOGIN_URL_RE, { timeout: 15_000 })
})
