import { expect, test } from '@playwright/test'

/**
 * Runs before all other test projects (via Playwright project dependencies).
 * If the app is in initial setup mode (no users), completes the /setup flow
 * so subsequent tests can log in normally.
 */
test('ensure app is initialised', async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
  const password = process.env.E2E_USER_PASSWORD ?? 'password'

  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  if (!page.url().includes('/setup')) return

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByLabel('Répéter le mot de passe').fill(password)
  await page.getByRole('button', { name: "Créer l'utilisateur" }).click()

  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
})
