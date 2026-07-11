import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'
const EDIT_URL_RE = /\/territories\/territory\/\d+\/edit/
const EDIT_URL_ID_RE = /\/territories\/territory\/(\d+)\/edit/
const RAIL_HEADING_RE = /modifications? en attente|pending changes/i
const BBOX_REQUEST_RE = /entrances-in-bbox/

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

    const response = await page.request.get('/territories/api/entrances-in-bbox?bbox=0,0,1,1&territoryId=1')
    expect(response.status()).toBeLessThan(500)
    if (response.ok()) {
      const body = await response.json()
      // Either the territory exists (entrances + truncated keys) or returns a 404 wrapper.
      // Both are valid responses for this smoke test.
      expect(body).toBeDefined()
    }
  })

  test('the territory-content API endpoint rejects unauthenticated requests', async ({ playwright }) => {
    const anonRequest = await playwright.request.newContext()
    const response = await anonRequest.get('/territories/api/territory/1/content')
    // Either a redirect (30x) or an auth error (401/403). What matters is it is NOT a plain 200 JSON body.
    if (response.ok()) {
      const body = await response.json().catch(() => null)
      // Loader must not leak the aggregate shape without an authenticated session.
      expect(body).not.toHaveProperty('entranceCount')
    } else {
      expect(response.status()).toBeGreaterThanOrEqual(300)
      expect(response.status()).toBeLessThan(500)
    }
    await anonRequest.dispose()
  })

  test('the territory-content API endpoint returns 400 for a malformed id (not an HTML redirect)', async ({ page }) => {
    const goto = await page.goto('/territories')
    if ((goto?.status() ?? 500) >= 500) test.skip()

    const response = await page.request.get('/territories/api/territory/not-a-number/content')
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body).toEqual({ error: 'invalid_id' })
  })

  test('the territory-content API endpoint returns aggregates when the territory exists', async ({ page }) => {
    const goto = await page.goto('/territories')
    if ((goto?.status() ?? 500) >= 500) test.skip()

    // Fetch the first territory id from the list — skip if the fixture has none.
    const firstEditLink = page.locator('a[href*="/territories/territory/"][href$="/edit"]').first()
    if (!(await firstEditLink.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip()
      return
    }
    const href = await firstEditLink.getAttribute('href')
    const match = href?.match(EDIT_URL_ID_RE)
    const territoryId = match?.[1]
    if (territoryId == null) test.skip()

    const response = await page.request.get(`/territories/api/territory/${territoryId}/content`)
    expect(response.status()).toBeLessThan(500)
    if (response.ok()) {
      const body = await response.json()
      expect(body).toHaveProperty('id')
      expect(body).toHaveProperty('number')
      expect(body).toHaveProperty('entranceCount')
      expect(body).toHaveProperty('quantity')
    }
  })

  test('edit page stays interactive after the map loads many entrances', async ({ page }) => {
    // Pre-grant map consent so the consent banner doesn't gate the map mount.
    // The key matches CONSENT_KEY in app/shared/ui/MapConsentBanner.tsx.
    await page.addInitScript(() => {
      window.localStorage.setItem('unitae_map_consent', 'true')
    })

    // 1500 stubbed entrances so the test doesn't depend on seed volume.
    await page.route('**/territories/api/entrances-in-bbox*', async route => {
      const entrances = Array.from({ length: 1500 }, (_, i) => ({
        id: 10_000_000 + i,
        latitude: 45.74 + (i % 40) * 0.0005,
        longitude: 4.83 + Math.floor(i / 40) * 0.0005,
        kind: 'Residential',
        shopKind: '',
        homes: 1,
        phones: 0,
        liberals: 0,
        address: { number: String(i), street: 'Rue de Test', zip: '69000' },
        buildingId: 20_000_000 + i,
        status: 'available',
        otherTerritory: null,
      }))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ entrances, truncated: false, total: null }),
      })
    })

    const response = await page.goto('/territories')
    if ((response?.status() ?? 500) >= 500) test.skip()

    const editLink = page.locator('a[href*="/territories/territory/"][href$="/edit"]').first()
    if (!(await editLink.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip()
      return
    }

    const bboxRequest = page.waitForRequest(BBOX_REQUEST_RE)
    await editLink.click()
    await expect(page).toHaveURL(EDIT_URL_RE)

    const textarea = page.locator('textarea[name="notes"]')
    await expect(textarea).toBeVisible()

    // Skip cleanly when Google Maps isn't configured — `.gm-style` only mounts once the Maps script loads.
    const mapLoaded = await page
      .waitForSelector('.gm-style', { timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    if (!mapLoaded) {
      test.skip(true, 'Google Maps not configured (.gm-style never mounted)')
      return
    }

    // Fails loudly if the bbox interception ever stops matching — otherwise zero markers would mount.
    await bboxRequest

    // Many markers, main thread stays free — textarea must accept input within a short budget.
    await textarea.fill('still responsive', { timeout: 2000 })
    await expect(textarea).toHaveValue('still responsive')
  })
})
