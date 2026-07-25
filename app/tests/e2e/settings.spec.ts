import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'Str0ng-E2E-Passphrase-42'
const SETTINGS_URL_RE = /\/settings/

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('settings users page loads', async ({ page }) => {
    await page.goto('/settings/users')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(SETTINGS_URL_RE)
  })

  test('settings congregation page loads', async ({ page }) => {
    await page.goto('/settings/congregation')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(SETTINGS_URL_RE)
  })
})
