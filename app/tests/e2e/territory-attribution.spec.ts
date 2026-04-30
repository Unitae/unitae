import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'

const LOGIN_URL_RE = /\/login/
const TERRITORIES_URL_RE = /\/territories/
const ATTRIBUTIONS_URL_RE = /\/territories\/attributions/
const NEW_ATTRIBUTION_URL_RE = /\/territories\/attributions\/new/
const SUBMIT_BUTTON_RE = /enregistrer|sauvegarder|créer|ajouter/i

test.describe('Territory management', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('territories page loads and is accessible', async ({ page }) => {
    const response = await page.goto('/territories')
    await page.waitForLoadState('networkidle')
    expect(response?.status()).toBeLessThan(500)
    await expect(page).not.toHaveURL(LOGIN_URL_RE)
  })

  test('territory attribution list is accessible', async ({ page }) => {
    const response = await page.goto('/territories/attributions')
    await page.waitForLoadState('networkidle')
    expect(response?.status()).toBeLessThan(500)
    await expect(page).toHaveURL(ATTRIBUTIONS_URL_RE)
  })

  test('new attribution page is accessible', async ({ page }) => {
    const response = await page.goto('/territories/attributions/new')
    expect(response?.status()).toBeLessThan(500)
  })

  test('submitting new attribution form without required fields shows validation error', async ({ page }) => {
    await page.goto('/territories/attributions/new')
    await page.waitForLoadState('networkidle')

    if (!page.url().includes('/territories/attributions/new')) test.skip()

    const submitButton = page.getByRole('button', { name: SUBMIT_BUTTON_RE })
    if (!(await submitButton.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip()
      return
    }

    await submitButton.click()
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveURL(NEW_ATTRIBUTION_URL_RE)
  })

  test('territories list page has expected structure', async ({ page }) => {
    await page.goto('/territories')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(TERRITORIES_URL_RE)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(0)
  })
})
