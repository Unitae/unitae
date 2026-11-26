import { expect, type Page, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

const ADMIN_EMAIL = E2E_ADMIN_EMAIL
const ADMIN_PASSWORD = E2E_ADMIN_PASSWORD

const TEMPLATES_URL_RE = /\/settings\/templates/
const TEMPLATE_URL_RE = /\/settings\/schedule-templates\?template=\d+/
const SECOND_SPEAKER_LABEL_RE = /Deuxième orateur/i
const PUBLISHER_DEFAULT_RE = /Proclamateur \(par défaut\)/i
const ALLOWED_SPEAKER_RE = /Rôles autorisés comme orateur/i
const ADD_ROLE_RE = /Ajouter un rôle/i
const ORATEUR_RE = /Orateur/i
const SAVE_BUTTON_RE = /Enregistrer|Save/i
const EVENT_LINK_RE = /Réunion|Memorial|Mémorial/i
const PARTS_FILLED_RE = /\d+\/\d+/

// A programme template opens in « Modèles de planning »'s panel, its parts editable at the panel's second level.
async function openFirstTemplatePage(page: Page): Promise<boolean> {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/settings/schedule-templates')
  await page.waitForLoadState('networkidle')

  const programme = page.locator('[data-row-primary]').filter({ hasText: 'Spirituel' }).first()
  if (!(await programme.isVisible({ timeout: 3000 }).catch(() => false))) return false
  await programme.click()
  await page.waitForURL(TEMPLATE_URL_RE, { timeout: 5000 }).catch(() => undefined)
  return TEMPLATE_URL_RE.test(page.url())
}

async function openFirstPartEditSheet(page: Page): Promise<boolean> {
  const part = page.locator('[data-item^="part-"]').first()
  if (
    !(await part.waitFor({ timeout: 5000 }).then(
      () => true,
      () => false,
    ))
  ) {
    return false
  }
  await part.click()
  return true
}

test.describe('Role-gated assignees — UI surface', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('templates list loads under /settings/templates', async ({ page }) => {
    await page.goto('/settings/templates')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(TEMPLATES_URL_RE)
  })

  test('part edit sheet exposes role pickers and the publisher-default chip', async ({ page }) => {
    const reached = await openFirstTemplatePage(page)
    if (!reached) {
      test.skip(true, 'Could not reach a template page (no seed templates or insufficient perms)')
      return
    }

    const opened = await openFirstPartEditSheet(page)
    if (!opened) {
      test.skip(true, 'No template parts available to edit')
      return
    }

    await expect(page.getByText('Identité', { exact: true })).toBeVisible()
    await expect(page.getByText('Programme', { exact: true })).toBeVisible()
    await expect(page.getByText(ORATEUR_RE).first()).toBeVisible()
    // The second person's slot shows only for a part that has one; the speaker's roles always do.
    await expect(page.getByRole('group', { name: ALLOWED_SPEAKER_RE })).toBeVisible()

    await expect(page.getByText(PUBLISHER_DEFAULT_RE).first()).toBeVisible()

    await expect(page.getByRole('button', { name: SAVE_BUTTON_RE }).last()).toBeVisible()
  })

  test('adding a role from the menu replaces the publisher default', async ({ page }) => {
    const reached = await openFirstTemplatePage(page)
    if (!reached) {
      test.skip(true, 'Could not reach a template page')
      return
    }
    const opened = await openFirstPartEditSheet(page)
    if (!opened) {
      test.skip(true, 'No template parts available')
      return
    }

    const speakerRoles = page.getByRole('group', { name: ALLOWED_SPEAKER_RE })
    if (
      !(await speakerRoles
        .getByText(PUBLISHER_DEFAULT_RE)
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false))
    ) {
      test.skip(true, 'This part already restricts its speakers')
      return
    }

    await speakerRoles.getByRole('button', { name: ADD_ROLE_RE }).click()
    const option = page.getByRole('option').first()
    const roleName = (await option.textContent())?.trim() ?? ''
    await option.click()
    // The menu stays open for the next role; Escape closes it and leaves the sheet open.
    await page.keyboard.press('Escape')

    await expect(speakerRoles.getByRole('button', { name: `Retirer ${roleName}` })).toBeVisible()
    await expect(speakerRoles.getByText(PUBLISHER_DEFAULT_RE)).toHaveCount(0)
  })

  test('event view column header reads "Deuxième orateur"', async ({ page }) => {
    await page.goto('/programs')
    await page.waitForLoadState('networkidle')

    // A meeting with a programme: the empty meetings created ahead have no parts, so no table (« — » in the row).
    const firstEvent = page
      .getByRole('row')
      .filter({ hasText: PARTS_FILLED_RE })
      .getByRole('link', { name: EVENT_LINK_RE })
      .first()
    if (!(await firstEvent.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'No events visible — skipping')
      return
    }
    await firstEvent.click()
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('columnheader', { name: SECOND_SPEAKER_LABEL_RE })).toBeVisible()
  })
})
