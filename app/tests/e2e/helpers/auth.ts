import type { Page } from '@playwright/test'

const EMAIL_RE = /email/i
const PASSWORD_RE = /mot de passe/i
const LOGIN_RE = /connexion/i

/**
 * Logs in via the UI login form.
 * Returns true if login succeeded, false if login page was not available
 * (e.g., app redirected to /setup because no users exist).
 */
export async function login(page: Page, email: string, password: string): Promise<boolean> {
  await page.goto('/login')

  // If no users exist, the app redirects to /setup or /register
  if (page.url().includes('/setup') || page.url().includes('/register')) {
    return false
  }

  const emailField = page.getByLabel(EMAIL_RE)
  if (!(await emailField.isVisible({ timeout: 3000 }).catch(() => false))) {
    return false
  }

  await emailField.fill(email)
  await page.getByLabel(PASSWORD_RE).fill(password)
  await page.getByRole('button', { name: LOGIN_RE }).click()

  // Wait for navigation away from login (max 10s)
  try {
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10_000 })
    return true
  } catch {
    return false
  }
}
