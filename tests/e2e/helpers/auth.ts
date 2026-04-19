import type { Page } from '@playwright/test'

/**
 * Logs in via the UI login form.
 * Assumes the app is running and the user exists in the database.
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/mot de passe/i).fill(password)
  await page.getByRole('button', { name: /connexion/i }).click()
  // Wait for navigation away from login
  await page.waitForURL((url) => !url.pathname.includes('/login'))
}
