import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const ADMIN_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const ADMIN_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'

const TEMPLATES_URL_RE = /\/settings\/congregation\/templates/
const SECOND_SPEAKER_LABEL_RE = /Deuxième orateur/i
const PUBLISHER_DEFAULT_RE = /Proclamateur \(par défaut\)/i
const TEMPLATE_LINK_RE = /Réunion|Mémorial|Memorial|Midweek|Weekend/i
const ORATEUR_RE = /Orateur/i
const SAVE_BUTTON_RE = /Enregistrer|Save/i
const ROLE_CHIP_RE = /Ancien|Elder|Proclamateur|Publisher/i
const EVENT_LINK_RE = /Réunion|Memorial|Mémorial/i

test.describe('Role-gated assignees — UI surface', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('templates list loads under /settings/congregation/templates', async ({ page }) => {
    await page.goto('/settings/congregation/templates')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(TEMPLATES_URL_RE)
  })

  test('part edit sheet exposes role pickers and the publisher-default chip', async ({ page }) => {
    await page.goto('/settings/congregation/templates')
    await page.waitForLoadState('networkidle')

    // Open the first template
    const firstTemplate = page.getByRole('link', { name: TEMPLATE_LINK_RE }).first()
    if (!(await firstTemplate.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'No seed templates visible — skipping')
      return
    }
    await firstTemplate.click()
    await page.waitForLoadState('networkidle')

    // Click the first edit-part pencil button
    const editButton = page
      .getByRole('button')
      .filter({ has: page.locator('svg.lucide-pencil') })
      .first()
    await editButton.click()

    // Sheet opens — verify the new groups & pickers are present
    await expect(page.getByText('Identité', { exact: true })).toBeVisible()
    await expect(page.getByText('Programme', { exact: true })).toBeVisible()
    await expect(page.getByText(ORATEUR_RE).first()).toBeVisible()
    await expect(page.getByText(SECOND_SPEAKER_LABEL_RE).first()).toBeVisible()

    // Both role pickers should show the publisher-default ghost chip when nothing is selected
    await expect(page.getByText(PUBLISHER_DEFAULT_RE).first()).toBeVisible()

    // The footer should be visible (pinned outside the form scroll)
    await expect(page.getByRole('button', { name: SAVE_BUTTON_RE }).last()).toBeVisible()
  })

  test('clicking a role chip toggles its selected state and hides the publisher default', async ({ page }) => {
    await page.goto('/settings/congregation/templates')
    await page.waitForLoadState('networkidle')

    const firstTemplate = page.getByRole('link', { name: TEMPLATE_LINK_RE }).first()
    if (!(await firstTemplate.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'No seed templates visible — skipping')
      return
    }
    await firstTemplate.click()
    await page.waitForLoadState('networkidle')

    const editButton = page
      .getByRole('button')
      .filter({ has: page.locator('svg.lucide-pencil') })
      .first()
    await editButton.click()

    // Click on the first built-in role chip (e.g. "Ancien")
    const chip = page.getByRole('checkbox', { name: ROLE_CHIP_RE }).first()
    if (!(await chip.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'No role chips visible — likely no built-in roles seeded')
      return
    }
    // Use the visible chip label to click (not the sr-only checkbox)
    const chipLabel = page.locator('label[data-builtin="true"]').first()
    await chipLabel.click()

    // Default chip should disappear after a selection
    await expect(page.getByText(PUBLISHER_DEFAULT_RE).first()).toHaveCount(0)
    // The chip is now selected
    await expect(chipLabel).toHaveAttribute('data-selected', 'true')
  })

  test('event view column header reads "Deuxième orateur"', async ({ page }) => {
    await page.goto('/programs')
    await page.waitForLoadState('networkidle')

    // Click into the first event if any exist
    const firstEvent = page.getByRole('link', { name: EVENT_LINK_RE }).first()
    if (!(await firstEvent.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'No events visible — skipping')
      return
    }
    await firstEvent.click()
    await page.waitForLoadState('networkidle')

    // Column header in the parts table
    await expect(page.getByRole('columnheader', { name: SECOND_SPEAKER_LABEL_RE })).toBeVisible()
  })
})
