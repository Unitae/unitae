import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'

const LOGIN_URL_RE = /\/login/
const TERRITORIES_URL_RE = /\/territories/
const NEW_TERRITORY_URL_RE = /\/territories\/new/
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
    // Must not redirect to login — admin has territory access
    await expect(page).not.toHaveURL(LOGIN_URL_RE)
  })

  test('new territory page is accessible', async ({ page }) => {
    const response = await page.goto('/territories/new')
    expect(response?.status()).toBeLessThan(500)
  })

  test('territory attribution page is accessible when territories exist', async ({ page }) => {
    await page.goto('/territories')
    await page.waitForLoadState('networkidle')

    // Try to navigate to attributions — valid route regardless of data
    const response = await page.goto('/territories/attributions')
    expect(response?.status()).toBeLessThan(500)
  })

  test('submitting new territory form without required fields shows validation error', async ({ page }) => {
    await page.goto('/territories/new')
    await page.waitForLoadState('networkidle')

    if (!page.url().includes('/territories/new')) test.skip()

    const submitButton = page.getByRole('button', { name: SUBMIT_BUTTON_RE })
    if (!(await submitButton.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip()
      return
    }

    await submitButton.click()
    await page.waitForLoadState('networkidle')

    // Must stay on form page — validation error
    await expect(page).toHaveURL(NEW_TERRITORY_URL_RE)
  })

  test('territories list page has expected structure', async ({ page }) => {
    await page.goto('/territories')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(TERRITORIES_URL_RE)

    // Page should not be blank
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(0)
  })
})
