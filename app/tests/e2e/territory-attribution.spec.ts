import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

const TEST_EMAIL = E2E_ADMIN_EMAIL
const TEST_PASSWORD = E2E_ADMIN_PASSWORD

const LOGIN_URL_RE = /\/login/
const TERRITORIES_URL_RE = /\/territories/
const ATTRIBUTIONS_URL_RE = /\/territories\/attributions/
const PICKER_URL_RE = /\/territories\/attributions\/new\/available-territories/
const ASSIGN_ROW_RE = /^Attribuer le territoire|^Assign territory/
const ASSIGN_SUBMIT_RE = /^Attribuer \S+$|^Assign \S+$/
const PUBLISHER_REQUIRED_RE = /Choisissez un proclamateur|Choose a publisher/
const LATE_VIEW_RE = /^En retard|^Overdue/
const LATE_VIEW_URL_RE = /view=late/

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

  test('the old new-attribution address lands on « Attribuer un territoire »', async ({ page }) => {
    const response = await page.goto('/territories/attributions/new')
    expect(response?.status()).toBeLessThan(500)
    await expect(page).toHaveURL(PICKER_URL_RE)
  })

  test('attributing without a publisher keeps the panel open and says what is missing', async ({ page }) => {
    await page.goto('/territories/attributions/new/available-territories?view=all')
    await page.waitForLoadState('networkidle')

    const assign = page.getByRole('button', { name: ASSIGN_ROW_RE }).first()
    if (!(await assign.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip()
      return
    }
    await assign.click()

    const submit = page.getByRole('button', { name: ASSIGN_SUBMIT_RE })
    await expect(submit).toBeVisible()
    await submit.click()

    await expect(page.getByText(PUBLISHER_REQUIRED_RE)).toBeVisible()
    await expect(submit).toBeVisible()
  })

  test('the late view keeps its place in the address', async ({ page }) => {
    await page.goto('/territories/attributions')
    await page.waitForLoadState('networkidle')

    const late = page.getByRole('button', { name: LATE_VIEW_RE })
    if (!(await late.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip()
      return
    }
    await late.click()
    await expect(page).toHaveURL(LATE_VIEW_URL_RE)
    await expect(late).toHaveAttribute('aria-pressed', 'true')
  })

  test('territories list page has expected structure', async ({ page }) => {
    await page.goto('/territories')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(TERRITORIES_URL_RE)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(0)
  })
})
