import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

const TEST_EMAIL = E2E_ADMIN_EMAIL
const TEST_PASSWORD = E2E_ADMIN_PASSWORD
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
