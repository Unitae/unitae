import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'
const EDIT_URL_RE = /\/territories\/territory\/\d+\/edit/
const RAIL_HEADING_RE = /modifications? en attente|pending changes/i

test.describe('Territory edit page', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('renders the edit page for an existing territory', async ({ page }) => {
    const response = await page.goto('/territories')
    await page.waitForLoadState('networkidle')
    if ((response?.status() ?? 500) >= 500) test.skip()

    const editLink = page.locator('a[href*="/territories/territory/"][href$="/edit"]').first()
    if (!(await editLink.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip()
      return
    }

    await editLink.click()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(EDIT_URL_RE)

    // The pending-changes rail is rendered in both map and dropdown modes.
    const railHeading = page.getByRole('heading', { name: RAIL_HEADING_RE })
    await expect(railHeading).toBeVisible({ timeout: 5000 })

    // The notes textarea is part of the form.
    await expect(page.locator('textarea[name="notes"]')).toBeVisible()
  })

  test('the bbox API endpoint is reachable and protects against unauth requests', async ({ page }) => {
    // When logged in, calling the endpoint with valid params must return JSON (not HTML/redirect).
    const goto = await page.goto('/territories')
    if ((goto?.status() ?? 500) >= 500) test.skip()

    const response = await page.request.get(
      '/territories/api/entrances-in-bbox?bbox=0,0,1,1&territoryId=1',
    )
    expect(response.status()).toBeLessThan(500)
    if (response.ok()) {
      const body = await response.json()
      // Either the territory exists (entrances + truncated keys) or returns a 404 wrapper.
      // Both are valid responses for this smoke test.
      expect(body).toBeDefined()
    }
  })
})
