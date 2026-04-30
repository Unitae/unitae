import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'

const LOGIN_URL_RE = /\/login/
const SETTINGS_URL_RE = /\/settings/
const PLATFORM_ADMIN_PATH = '/platform-admin'

test.describe('Access control', () => {
  test('unauthenticated request to any protected route redirects to login', async ({ page }) => {
    await page.goto('/login')
    if (page.url().includes('/setup') || page.url().includes('/register')) test.skip()

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

  test('platform admin route is not accessible to regular users', async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()

    const response = await page.goto(PLATFORM_ADMIN_PATH)
    await page.waitForLoadState('networkidle')
    // Regular users must not reach the platform admin page
    const status = response?.status() ?? 200
    const isRedirectedOrForbidden = status === 403 || status === 404 || !page.url().includes(PLATFORM_ADMIN_PATH)
    expect(isRedirectedOrForbidden).toBe(true)
  })

  test('health endpoint is publicly accessible', async ({ page }) => {
    const response = await page.goto('/health')
    expect(response?.status()).toBe(200)
  })
})
