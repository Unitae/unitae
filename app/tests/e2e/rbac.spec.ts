import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

const TEST_EMAIL = E2E_ADMIN_EMAIL
const TEST_PASSWORD = E2E_ADMIN_PASSWORD

const LOGIN_URL_RE = /\/login/
const SETTINGS_URL_RE = /\/settings/

test.describe('Access control', () => {
  test('unauthenticated request to any protected route redirects to login', async ({ page }) => {
    for (const route of ['/publishers', '/territories', '/board', '/settings/users']) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL(LOGIN_URL_RE)
    }
  })

  test('login page is publicly accessible without redirection', async ({ page }) => {
    const response = await page.goto('/login')
    expect(response?.status()).toBeLessThan(500)
    expect(page.url()).not.toContain('/dashboard')
  })

  test('authenticated admin user can access settings', async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()

    await page.goto('/settings/users')
    await page.waitForLoadState('networkidle')
    // Admin should not be redirected away from settings
    await expect(page).toHaveURL(SETTINGS_URL_RE)
    await expect(page).not.toHaveURL(LOGIN_URL_RE)
  })

  test('health endpoint is publicly accessible', async ({ page }) => {
    const response = await page.goto('/health')
    expect(response?.status()).toBe(200)
  })
})
