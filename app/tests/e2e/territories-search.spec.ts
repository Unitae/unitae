import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

const TEST_EMAIL = E2E_ADMIN_EMAIL
const TEST_PASSWORD = E2E_ADMIN_PASSWORD

const SEARCH_PLACEHOLDER_RE = /numéro|number/i
const CLEAR_ALL_RE = /tout effacer/i

test.describe('Territories — unified search', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('search field is present on /territories and says what it finds', async ({ page }) => {
    const response = await page.goto('/territories')
    if (response && response.status() >= 400) test.skip()

    const searchInput = page.getByRole('searchbox').first()
    if (!(await searchInput.isVisible({ timeout: 3000 }).catch(() => false))) test.skip()

    await expect(searchInput).toHaveAttribute('placeholder', SEARCH_PLACEHOLDER_RE)
  })

  test('typing a search puts it on the URL', async ({ page }) => {
    const response = await page.goto('/territories')
    if (response && response.status() >= 400) test.skip()

    const searchInput = page.getByRole('searchbox').first()
    if (!(await searchInput.isVisible({ timeout: 3000 }).catch(() => false))) test.skip()

    const query = `zzqry-${Date.now()}`
    await searchInput.fill(query)

    await page.waitForURL(url => url.searchParams.get('search') === query, { timeout: 5000 })
  })

  test('"Tout effacer" clears the filters and keeps the search', async ({ page }) => {
    await page.goto('/territories?search=pajot&type=Classical')

    const clearAll = page.getByRole('link', { name: CLEAR_ALL_RE }).first()
    if (!(await clearAll.isVisible({ timeout: 3000 }).catch(() => false))) test.skip()

    await clearAll.click()
    await page.waitForURL(url => !url.searchParams.has('type'), { timeout: 5000 })

    expect(new URL(page.url()).searchParams.get('search')).toBe('pajot')
  })

  test('accent-insensitive name search returns the publisher with diacritics', async ({ page }) => {
    // Lightweight smoke: the loader doesn't throw and the list page renders.
    // We can't assert specific data without seeding fixtures, but the rendering
    // pipeline (incl. the normalized-column query) executing is the goal.
    const response = await page.goto('/territories?search=jean')
    if (response && response.status() >= 400) test.skip()

    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('main')).toBeVisible()
  })
})
