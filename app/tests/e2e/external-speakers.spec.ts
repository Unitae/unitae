import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'
const REGISTRY_URL_RE = /\/programs\/external-speakers/

test.describe('External speakers registry', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('registry page loads at /programs/external-speakers', async ({ page }) => {
    await page.goto('/programs/external-speakers')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(REGISTRY_URL_RE)
    await expect(page.getByRole('heading', { name: 'Orateurs externes' }).first()).toBeVisible()
  })

  test('add-speaker form loads at /programs/external-speakers/new', async ({ page }) => {
    await page.goto('/programs/external-speakers/new')
    await page.waitForLoadState('networkidle')
    await expect(page.getByLabel('Prénom et nom')).toBeVisible()
    await expect(page.getByLabel('Congrégation')).toBeVisible()
  })
})
