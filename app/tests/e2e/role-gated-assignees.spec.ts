import { expect, type Page, test } from '@playwright/test'
import { login } from './helpers/auth'

const ADMIN_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const ADMIN_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'

const TEMPLATES_URL_RE = /\/settings\/congregation\/templates/
const TEMPLATE_EDIT_URL_RE = /\/settings\/congregation\/templates\/\d+\/edit/
const SECOND_SPEAKER_LABEL_RE = /Deuxième orateur/i
const PUBLISHER_DEFAULT_RE = /Proclamateur \(par défaut\)/i
const TEMPLATE_LINK_RE = /Réunion|Mémorial|Memorial|Midweek|Weekend/i
const EDIT_BUTTON_RE = /^Modifier$/i
const ORATEUR_RE = /Orateur/i
const SAVE_BUTTON_RE = /Enregistrer|Save/i
const EVENT_LINK_RE = /Réunion|Memorial|Mémorial/i

async function openFirstTemplateEditPage(page: Page): Promise<boolean> {
  await page.goto('/settings/congregation/templates')
  await page.waitForLoadState('networkidle')

  const firstTemplate = page.getByRole('link', { name: TEMPLATE_LINK_RE }).first()
  if (!(await firstTemplate.isVisible({ timeout: 3000 }).catch(() => false))) {
    return false
  }
  await firstTemplate.click()
  await page.waitForLoadState('networkidle')

  const editButton = page.getByRole('link', { name: EDIT_BUTTON_RE }).first()
  if (!(await editButton.isVisible({ timeout: 3000 }).catch(() => false))) {
    return false
  }
  await editButton.click()
  await page.waitForURL(TEMPLATE_EDIT_URL_RE, { timeout: 5000 }).catch(() => undefined)
  await page.waitForLoadState('networkidle')
  return page.url().match(TEMPLATE_EDIT_URL_RE) != null
}

async function openFirstPartEditSheet(page: Page): Promise<boolean> {
  // The edit page lists template parts; each row has a pencil button to open the part edit sheet.
  // svg.lucide-pencil is rendered by the lucide-react Pencil icon used in the row action cell.
  const partPencil = page
    .getByRole('button')
    .filter({ has: page.locator('svg.lucide-pencil') })
    .first()
  if (!(await partPencil.isVisible({ timeout: 5000 }).catch(() => false))) {
    return false
  }
  await partPencil.click()
  return true
}

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
    const reached = await openFirstTemplateEditPage(page)
    if (!reached) {
      test.skip(true, 'Could not reach a template edit page (no seed templates or insufficient perms)')
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
    await expect(page.getByText(SECOND_SPEAKER_LABEL_RE).first()).toBeVisible()

    await expect(page.getByText(PUBLISHER_DEFAULT_RE).first()).toBeVisible()

    await expect(page.getByRole('button', { name: SAVE_BUTTON_RE }).last()).toBeVisible()
  })

  test('clicking a role chip toggles its selected state and hides the publisher default', async ({ page }) => {
    const reached = await openFirstTemplateEditPage(page)
    if (!reached) {
      test.skip(true, 'Could not reach a template edit page')
      return
    }
    const opened = await openFirstPartEditSheet(page)
    if (!opened) {
      test.skip(true, 'No template parts available')
      return
    }

    const chipLabel = page.locator('label[data-builtin="true"]').first()
    if (!(await chipLabel.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'No built-in role chips visible')
      return
    }
    await chipLabel.click()

    await expect(page.getByText(PUBLISHER_DEFAULT_RE).first()).toHaveCount(0)
    await expect(chipLabel).toHaveAttribute('data-selected', 'true')
  })

  test('event view column header reads "Deuxième orateur"', async ({ page }) => {
    await page.goto('/programs')
    await page.waitForLoadState('networkidle')

    const firstEvent = page.getByRole('link', { name: EVENT_LINK_RE }).first()
    if (!(await firstEvent.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'No events visible — skipping')
      return
    }
    await firstEvent.click()
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('columnheader', { name: SECOND_SPEAKER_LABEL_RE })).toBeVisible()
  })
})
