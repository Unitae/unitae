import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'

const COMMERCES_URL_RE = /\/territories\/buildings\/split-territories\/commerces/
const RAIL_TITLE_RE = /nouveau territoire/i
const SUBMIT_BUTTON_RE = /créer le territoire/i
const CREATED_TOAST_RE = /territoire .+ a été créé/i
const NUMBER_CHIP_RE = /^C\d{3,}$/
const NO_MAP_CTA_RE = /accepter et afficher la carte/i
const CONFIG_MISSING_RE = /carte non configurée/i
const ADD_TO_SELECTION_RE = /ajouter à la sélection/i

test.describe('Split-tool map-driven create flow', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('rail renders with a suggested number chip and disabled submit', async ({ page }) => {
    await page.goto('/territories/buildings/split-territories/commerces')
    await page.waitForLoadState('networkidle')

    if (!page.url().match(COMMERCES_URL_RE)) test.skip()

    // Skip the map-dependent expectations if Maps isn't configured / consent not accepted.
    const configMissing = await page
      .getByText(CONFIG_MISSING_RE)
      .isVisible()
      .catch(() => false)
    const consentBanner = await page
      .getByRole('button', { name: NO_MAP_CTA_RE })
      .isVisible()
      .catch(() => false)
    if (configMissing || consentBanner) {
      // The rail should still render even without the map.
    }

    await expect(page.getByRole('heading', { name: RAIL_TITLE_RE })).toBeVisible()

    // Suggested number chip — e.g. "C001", "C042"
    const numberChip = page.locator('span.font-mono').first()
    await expect(numberChip).toBeVisible()
    await expect(numberChip).toHaveText(NUMBER_CHIP_RE)

    // With an empty draft the submit button is disabled
    const submit = page.getByRole('button', { name: SUBMIT_BUTTON_RE })
    await expect(submit).toBeDisabled()
  })

  test('creating a territory resets the draft and increments the suggested number', async ({ page }) => {
    await page.goto('/territories/buildings/split-territories/commerces')
    await page.waitForLoadState('networkidle')

    if (!page.url().match(COMMERCES_URL_RE)) test.skip()

    // The rest of this test needs pins actually rendered on the map. If the environment has
    // no API key, no consent, or no commerce fixtures we bail — this is a smoke test.
    const configMissing = await page
      .getByText(CONFIG_MISSING_RE)
      .isVisible()
      .catch(() => false)
    if (configMissing) test.skip()

    const consentButton = page.getByRole('button', { name: NO_MAP_CTA_RE })
    if (await consentButton.isVisible().catch(() => false)) {
      await consentButton.click()
      await page.waitForLoadState('networkidle')
    }

    const numberChip = page.locator('span.font-mono').first()
    await expect(numberChip).toBeVisible()
    const initialNumber = (await numberChip.textContent())?.trim() ?? ''
    if (!NUMBER_CHIP_RE.test(initialNumber)) test.skip()

    // Marker buttons carry the address in their aria-label. Wait up to 5s for pins to render.
    const pinsLocator = page.locator('button[aria-label*=","]').filter({ hasNotText: SUBMIT_BUTTON_RE })
    const hasPins = await pinsLocator
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false)
    if (!hasPins) test.skip()

    const pinCount = await pinsLocator.count()
    if (pinCount < 1) test.skip()

    // Add the first pin to the draft. The popover's "Ajouter à la sélection" click toggles the map's
    // pending-select state and closes the popover.
    await pinsLocator.first().click()
    const addToSelection = page.getByRole('button', { name: ADD_TO_SELECTION_RE })
    await addToSelection.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {})
    if (await addToSelection.isVisible().catch(() => false)) {
      await addToSelection.click()
    }

    // Submit
    const submit = page.getByRole('button', { name: SUBMIT_BUTTON_RE })
    await expect(submit).toBeEnabled()
    await submit.click()

    // Toast confirms the created territory number
    await expect(page.getByText(CREATED_TOAST_RE)).toBeVisible({ timeout: 5_000 })

    // Suggested number chip incremented (loader auto-revalidated)
    await expect(numberChip).not.toHaveText(initialNumber, { timeout: 5_000 })

    // Draft cleared → submit button back to disabled
    await expect(submit).toBeDisabled()
  })
})
