import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'Str0ng-E2E-Passphrase-42'

const PUBLISHERS_URL_RE = /\/publishers/
const NEW_PUBLISHER_URL_RE = /\/publishers\/new/
const FIRSTNAME_FIELD_RE = /prénom/i
const LASTNAME_FIELD_RE = /^nom$/i
const SUBMIT_BUTTON_RE = /enregistrer|sauvegarder|créer|ajouter/i
const SEARCH_PLACEHOLDER_RE = /rechercher un proclamateur/i
const NO_MATCH_TITLE_RE = /aucun proclamateur trouvé/i

test.describe('Publishers', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('publisher list page loads', async ({ page }) => {
    await page.goto('/publishers')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(PUBLISHERS_URL_RE)
  })

  test('new publisher page is accessible', async ({ page }) => {
    const response = await page.goto('/publishers/new')
    expect(response?.status()).toBeLessThan(500)
  })

  test('submitting the publisher form without required fields shows validation errors', async ({ page }) => {
    await page.goto('/publishers/new')
    await page.waitForLoadState('networkidle')

    if (!page.url().includes('/publishers/new')) test.skip()

    // Submit without filling any fields
    await page.getByRole('button', { name: SUBMIT_BUTTON_RE }).click()
    await page.waitForLoadState('networkidle')

    // Should stay on the form page (validation error, no redirect)
    await expect(page).toHaveURL(NEW_PUBLISHER_URL_RE)
  })

  test('creates a publisher and shows them in the list', async ({ page }) => {
    await page.goto('/publishers/new')
    await page.waitForLoadState('networkidle')

    if (!page.url().includes('/publishers/new')) test.skip()

    const uniqueSuffix = Date.now()
    const firstname = 'E2E'
    const lastname = `Test-${uniqueSuffix}`

    const firstnameField = page.getByLabel(FIRSTNAME_FIELD_RE)
    const lastnameField = page.getByLabel(LASTNAME_FIELD_RE)

    if (!(await firstnameField.isVisible({ timeout: 3000 }).catch(() => false))) test.skip()

    await firstnameField.fill(firstname)
    await lastnameField.fill(lastname)
    await page.getByRole('radio', { name: 'Homme' }).check()

    // Submit the form
    await page.getByRole('button', { name: SUBMIT_BUTTON_RE }).click()
    await page.waitForLoadState('networkidle')

    // Should redirect to list or publisher detail page
    await expect(page).not.toHaveURL(NEW_PUBLISHER_URL_RE)

    // Navigate to list and verify the new publisher appears
    await page.goto('/publishers')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(lastname)).toBeVisible()
  })

  test('search input stays visible when no publishers match the query (#133)', async ({ page }) => {
    await page.goto('/publishers')
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByPlaceholder(SEARCH_PLACEHOLDER_RE)
    // The search input is only rendered when at least one publisher exists.
    // In a fully-empty congregation the bug cannot reproduce — skip.
    if (!(await searchInput.isVisible({ timeout: 3000 }).catch(() => false))) test.skip()

    const query = `zzz-no-match-${Date.now()}`
    await searchInput.fill(query)

    // SearchInput debounces URL updates by 300ms
    await page.waitForURL(url => url.searchParams.get('q') === query, { timeout: 5_000 })
    await page.waitForLoadState('networkidle')

    // Bug: the search input used to disappear together with the results.
    // Fix: it must remain in the DOM so the user can correct the typo.
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toHaveValue(query)
    await expect(page.getByText(NO_MATCH_TITLE_RE)).toBeVisible()
    await expect(page.getByText(query)).toBeVisible()

    // Clearing the input restores the previous list view
    await searchInput.fill('')
    await page.waitForURL(url => !url.searchParams.has('q'), { timeout: 5_000 })
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(NO_MATCH_TITLE_RE)).not.toBeVisible()
  })
})
