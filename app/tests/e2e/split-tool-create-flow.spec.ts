import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

const TEST_EMAIL = E2E_ADMIN_EMAIL
const TEST_PASSWORD = E2E_ADMIN_PASSWORD

const COMMERCES_URL_RE = /\/territories\/buildings\/split-territories\?(.*&)?type=Commerces/
const HEADING_RE = /^(Créer en lot|Create in bulk)$/
const NUMBER_FIELD_RE = /^(Prochain|Next)$/
const CREATE_RE = /^(Créer|Create) /
const CREATED_TOAST_RE = /(créé|created) ·/i
const CREATED_HERE_RE = /^(Créés ici|Created here)/
const FREE_PIN_RE = /, (libre|free)$/i
const ADD_RE = /Ajouter au territoire|Add to the territory/i

test.describe('Split tool: create territories in bulk', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('an old per-type address opens the tool on that type, with the next number suggested', async ({ page }) => {
    const response = await page.goto('/territories/buildings/split-territories/commerces')
    if ((response?.status() ?? 500) >= 400) test.skip()
    await page.waitForURL(COMMERCES_URL_RE)

    await expect(page.getByRole('heading', { name: HEADING_RE })).toBeVisible()
    const number = page.getByLabel(NUMBER_FIELD_RE)
    await expect(number).not.toHaveValue('')
    // Nothing chosen yet: nothing to create.
    await expect(page.getByRole('button', { name: CREATE_RE })).toBeDisabled()
  })

  test('creating a territory stays on the page, lists it and suggests the next number', async ({ page }) => {
    await page.goto('/territories/buildings/split-territories?type=Commerces')
    await page.waitForLoadState('networkidle')

    const mapMounted = await page
      .locator('.maplibregl-map')
      .first()
      .waitFor({ state: 'attached', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    if (!mapMounted) test.skip(true, 'No base map on this instance')

    const pin = page.getByRole('button', { name: FREE_PIN_RE }).first()
    const hasPin = await pin
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    if (!hasPin) test.skip(true, 'No free commerce entrance in this data set')

    const number = page.getByLabel(NUMBER_FIELD_RE)
    const first = await number.inputValue()
    await pin.click()
    await page.getByRole('button', { name: ADD_RE }).click()

    const create = page.getByRole('button', { name: CREATE_RE })
    await expect(create).toBeEnabled()
    await create.click()

    await expect(page.getByText(CREATED_TOAST_RE)).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('heading', { name: CREATED_HERE_RE })).toBeVisible()
    await expect(number).not.toHaveValue(first)
    await expect(create).toBeDisabled()
  })
})
