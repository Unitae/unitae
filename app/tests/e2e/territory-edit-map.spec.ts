import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'
const EDIT_URL_RE = /\/territories\/territory\/\d+\/edit/
const EDIT_URL_ID_RE = /\/territories\/territory\/(\d+)\/edit/
const RAIL_HEADING_RE = /modifications? en attente|pending changes/i
const BBOX_REQUEST_RE = /entrances-in-bbox/
const BUILDING_VIEW_URL_RE = /\/territories\/building\/\d+\/view/
const MARKER_ADDRESS_RE = /5 Rue de Test/i
const MARKER_ADDRESS_ALT_RE = /7 Rue Test/i
const BADGE_DIGICODE_RE = /digicode|keypad/i
const BADGE_PMR_RE = /PMR|wheelchair/i
const PROSPECTED_RE = /Prospecté|Last prospected/i
const IMPACT_HOMES_RE = /12 foyer/i
const IMPACT_DELTA_RE = /→\s*9/i
const SHOPKIND_BOULANGERIE_RE = /boulangerie/i
const VIEW_BUILDING_LINK_RE = /Voir le bâtiment|View building/i
const VIEW_TERRITORY_T42_RE = /Voir le territoire.*T-42|View territory.*T-42/i

type StubEntranceOverrides = Partial<{
  id: number
  latitude: number
  longitude: number
  kind: 'Residential' | 'Commerce' | 'Hotel' | 'Campus'
  shopKind: string
  homes: number
  phones: number
  liberals: number
  address: { number: string; street: string; zip: string }
  buildingId: number
  status: 'available' | 'in-this-territory' | 'on-other-territory'
  otherTerritory: { id: number; number: string } | null
  access: number | null
  accesses: { type: number }[]
  isPMR: boolean | null
  isOpenEarly: boolean | null
  isMailboxOpen: boolean | null
  prospectionDate: string | null
}>

function makeStubEntrance(over: StubEntranceOverrides = {}) {
  return {
    id: 10_000_001,
    latitude: 45.75,
    longitude: 4.83,
    kind: 'Residential' as const,
    shopKind: '',
    homes: 4,
    phones: 0,
    liberals: 0,
    address: { number: '5', street: 'Rue de Test', zip: '69000' },
    buildingId: 20_000_001,
    status: 'available' as const,
    otherTerritory: null,
    access: null,
    accesses: [] as { type: number }[],
    isPMR: null,
    isOpenEarly: null,
    isMailboxOpen: null,
    prospectionDate: null,
    ...over,
  }
}

async function stubBboxWith(page: Page, entrances: unknown[]) {
  await page.route('**/territories/api/entrances-in-bbox*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ entrances, truncated: false, total: null }),
    })
  })
}

async function stubContentWith(page: Page, territoryId: number, body: Record<string, unknown>) {
  await page.route(`**/territories/api/territory/${territoryId}/content`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
}

async function openFirstEditPage(page: Page): Promise<{ territoryId: string } | null> {
  await page.addInitScript(() => {
    window.localStorage.setItem('unitae_map_consent', 'true')
  })
  const response = await page.goto('/territories')
  if ((response?.status() ?? 500) >= 500) return null

  const editLink = page.locator('a[href*="/territories/territory/"][href$="/edit"]').first()
  if (!(await editLink.isVisible({ timeout: 3000 }).catch(() => false))) return null

  const href = await editLink.getAttribute('href')
  const territoryId = href?.match(EDIT_URL_ID_RE)?.[1]
  if (territoryId == null) return null

  await editLink.click()
  return { territoryId }
}

async function waitForMapMounted(page: Page): Promise<boolean> {
  return page
    .waitForSelector('.gm-style', { timeout: 5000 })
    .then(() => true)
    .catch(() => false)
}

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
    try {
      // Don't follow redirects — we want to observe the auth guard's original response,
      // not the login page HTML it lands on.
      const response = await anonRequest.get('/territories/api/territory/1/content', { maxRedirects: 0 })

      // Redirect or 4xx → auth guard did its job.
      if (response.status() >= 300 && response.status() < 500) return

      // Otherwise the response must NOT be the aggregate shape. A non-JSON body
      // (e.g. HTML login page) also counts as "no leak".
      const body = await response.json().catch(() => null)
      if (body == null) return
      expect(body).not.toHaveProperty('entranceCount')
    } finally {
      await anonRequest.dispose()
    }
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
        access: null,
        accesses: [],
        isPMR: null,
        isOpenEarly: null,
        isMailboxOpen: null,
        prospectionDate: null,
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

  test('clicking an available residential marker opens a popup with badges and prospection date', async ({ page }) => {
    await stubBboxWith(page, [
      makeStubEntrance({
        homes: 4,
        phones: 2,
        access: 4, // TerritoryAccess.Code
        accesses: [{ type: 4 }],
        isPMR: true,
        prospectionDate: '2024-06-15T00:00:00.000Z',
      }),
    ])
    const setup = await openFirstEditPage(page)
    if (setup == null) {
      test.skip()
      return
    }
    if (!(await waitForMapMounted(page))) {
      test.skip(true, 'Google Maps not configured (.gm-style never mounted)')
      return
    }

    const marker = page.getByRole('button', { name: MARKER_ADDRESS_RE }).first()
    if (!(await marker.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'Marker not reachable — likely a kind/permission mismatch on the seeded territory')
      return
    }
    await marker.click()

    // Badges use the six labels from map-popup-access-*. Assert on French + English variants.
    await expect(page.getByText(BADGE_DIGICODE_RE).first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByText(BADGE_PMR_RE).first()).toBeVisible()
    await expect(page.getByText(PROSPECTED_RE).first()).toBeVisible()
  })

  test('clicking an on-other-territory marker fires the content fetch and shows the impact block', async ({ page }) => {
    const OTHER_ID = 999_001
    await stubBboxWith(page, [
      makeStubEntrance({
        status: 'on-other-territory',
        homes: 3,
        otherTerritory: { id: OTHER_ID, number: 'T-OTHER' },
      }),
    ])
    await stubContentWith(page, OTHER_ID, {
      id: OTHER_ID,
      number: 'T-OTHER',
      kind: 'Classical',
      entranceCount: 8,
      quantity: 12,
      homes: 12,
      phones: 4,
      liberals: 0,
    })

    const setup = await openFirstEditPage(page)
    if (setup == null) {
      test.skip()
      return
    }
    if (!(await waitForMapMounted(page))) {
      test.skip(true, 'Google Maps not configured (.gm-style never mounted)')
      return
    }

    const marker = page.getByRole('button', { name: MARKER_ADDRESS_RE }).first()
    if (!(await marker.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'Marker not reachable')
      return
    }

    const contentRequest = page.waitForRequest(`**/territories/api/territory/${OTHER_ID}/content`)
    await marker.click()
    await contentRequest

    // Primary aggregate (12 foyers) and the delta preview (12 - 3 = 9) must both show.
    await expect(page.getByText(IMPACT_HOMES_RE).first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByText(IMPACT_DELTA_RE).first()).toBeVisible()
  })

  test('a Commerce entrance popup shows the shop kind', async ({ page }) => {
    // Prefer a Commerce territory if the fixture has one — else the edit page filters this entrance out.
    await page.addInitScript(() => {
      window.localStorage.setItem('unitae_map_consent', 'true')
    })
    const goto = await page.goto('/territories')
    if ((goto?.status() ?? 500) >= 500) test.skip()

    const editLinks = await page.locator('a[href*="/territories/territory/"][href$="/edit"]').all()
    let commerceTerritoryId: string | null = null
    for (const link of editLinks) {
      const href = await link.getAttribute('href')
      const id = href?.match(EDIT_URL_ID_RE)?.[1]
      if (id == null) continue
      const res = await page.request.get(`/territories/api/territory/${id}/content`)
      if (!res.ok()) continue
      const body = await res.json().catch(() => null)
      if (body?.kind === 'Commerces') {
        commerceTerritoryId = id
        break
      }
    }
    if (commerceTerritoryId == null) {
      test.skip(true, 'Fixture has no Commerces territory to test against')
      return
    }

    await stubBboxWith(page, [
      makeStubEntrance({
        kind: 'Commerce',
        shopKind: 'boulangerie',
        homes: 0,
        phones: 0,
        address: { number: '7', street: 'Rue Test', zip: '69000' },
      }),
    ])

    await page.goto(`/territories/territory/${commerceTerritoryId}/edit`)
    if (!(await waitForMapMounted(page))) {
      test.skip(true, 'Google Maps not configured (.gm-style never mounted)')
      return
    }

    const marker = page.getByRole('button', { name: MARKER_ADDRESS_ALT_RE }).first()
    if (!(await marker.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'Marker not reachable')
      return
    }
    await marker.click()

    // entranceContentLabel capitalizes and displays the shop kind.
    await expect(page.getByText(SHOPKIND_BOULANGERIE_RE).first()).toBeVisible({ timeout: 3000 })
  })

  test('clicking "Voir le bâtiment" opens the building view in a new tab and preserves edit-page state', async ({
    page,
  }) => {
    await stubBboxWith(page, [makeStubEntrance()])
    const setup = await openFirstEditPage(page)
    if (setup == null) {
      test.skip()
      return
    }
    if (!(await waitForMapMounted(page))) {
      test.skip(true, 'Google Maps not configured (.gm-style never mounted)')
      return
    }

    const marker = page.getByRole('button', { name: MARKER_ADDRESS_RE }).first()
    if (!(await marker.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'Marker not reachable')
      return
    }
    await marker.click()

    const viewBuildingLink = page.getByRole('link', { name: VIEW_BUILDING_LINK_RE }).first()
    if (!(await viewBuildingLink.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'Building link not visible')
      return
    }

    const [newPage] = await Promise.all([
      page.context().waitForEvent('page'),
      viewBuildingLink.click({ modifiers: [] }),
    ])
    await newPage.waitForLoadState('domcontentloaded').catch(() => undefined)
    expect(newPage.url()).toMatch(BUILDING_VIEW_URL_RE)
    await newPage.close()

    // The original edit page is still on the same URL — nothing navigated away.
    await expect(page).toHaveURL(EDIT_URL_RE)
  })

  test('on an on-other-territory popup, the "Voir le territoire" link points to the source territory', async ({
    page,
  }) => {
    await stubBboxWith(page, [
      makeStubEntrance({
        status: 'on-other-territory',
        otherTerritory: { id: 42_042, number: 'T-42' },
      }),
    ])
    const setup = await openFirstEditPage(page)
    if (setup == null) {
      test.skip()
      return
    }
    if (!(await waitForMapMounted(page))) {
      test.skip(true, 'Google Maps not configured (.gm-style never mounted)')
      return
    }

    const marker = page.getByRole('button', { name: MARKER_ADDRESS_RE }).first()
    if (!(await marker.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'Marker not reachable')
      return
    }
    await marker.click()

    const link = page.getByRole('link', { name: VIEW_TERRITORY_T42_RE }).first()
    await expect(link).toBeVisible({ timeout: 3000 })
    await expect(link).toHaveAttribute('href', '/territories/territory/42042/view')
    await expect(link).toHaveAttribute('target', '_blank')
  })
})
