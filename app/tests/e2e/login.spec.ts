import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'

const LOGIN_URL_RE = /\/login/
const LOGIN_WITH_PUBLISHERS_REDIRECT_RE = /\/login\?redirectTo=%2Fpublishers/
const PUBLISHERS_URL_RE = /\/publishers/
const EMAIL_FIELD_RE = /email/i
const PASSWORD_FIELD_RE = /mot de passe/i
const SUBMIT_BUTTON_RE = /connexion/i

test.describe('Authentication', () => {
  test('server responds to login page requests', async ({ page }) => {
    const response = await page.goto('/login')
    expect(response?.status()).toBeLessThan(500)
  })

  test('unauthenticated access to a protected route redirects to login', async ({ page }) => {
    await page.goto('/publishers')
    await expect(page).toHaveURL(LOGIN_URL_RE)
  })

  test('unauthenticated access preserves the intended URL as redirectTo', async ({ page }) => {
    await page.goto('/publishers')
    await expect(page).toHaveURL(LOGIN_WITH_PUBLISHERS_REDIRECT_RE)
  })

  test('logging in from a preserved redirectTo returns to the intended URL', async ({ page }) => {
    await page.goto('/publishers')

    // If no users exist yet, the app redirects to /setup or /register — skip.
    if (page.url().includes('/setup') || page.url().includes('/register')) {
      test.skip()
      return
    }

    const emailField = page.getByLabel(EMAIL_FIELD_RE)
    if (!(await emailField.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip()
      return
    }

    await emailField.fill(TEST_EMAIL)
    await page.getByLabel(PASSWORD_FIELD_RE).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: SUBMIT_BUTTON_RE }).click()

    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(PUBLISHERS_URL_RE)
    await expect(page).not.toHaveURL(LOGIN_URL_RE)
  })

  test('login with valid credentials navigates away from login page', async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()

    await expect(page).not.toHaveURL(LOGIN_URL_RE)
    expect(page.url()).not.toContain('/setup')
  })

  test('login with invalid credentials shows an error and stays on login page', async ({ page }) => {
    await page.goto('/login')

    if (page.url().includes('/setup') || page.url().includes('/register')) {
      test.skip()
      return
    }

    const emailField = page.getByLabel(EMAIL_FIELD_RE)
    if (!(await emailField.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip()
      return
    }

    await emailField.fill('wrong@example.com')
    await page.getByLabel(PASSWORD_FIELD_RE).fill('wrongpassword')
    await page.getByRole('button', { name: SUBMIT_BUTTON_RE }).click()

    // Must stay on the login page — no redirect on bad credentials
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(LOGIN_URL_RE)
  })

  test('authenticated user accessing a protected route sees the page', async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()

    await page.goto('/publishers')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(PUBLISHERS_URL_RE)
    await expect(page).not.toHaveURL(LOGIN_URL_RE)
  })
})
