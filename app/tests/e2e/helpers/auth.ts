import type { Page } from '@playwright/test'

const EMAIL_RE = /email/i
const PASSWORD_RE = /mot de passe/i
const LOGIN_RE = /connexion/i

/**
 * Logs in via the UI login form.
 * Assumes the app is running and the user exists in the database.
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel(EMAIL_RE).fill(email)
  await page.getByLabel(PASSWORD_RE).fill(password)
  await page.getByRole('button', { name: LOGIN_RE }).click()
  // Wait for navigation away from login
  await page.waitForURL(url => !url.pathname.includes('/login'))
}
