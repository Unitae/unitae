import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'

test.describe('Publishers', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('publisher list page loads', async ({ page }) => {
    await page.goto('/publishers')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/publishers/)
  })
})
