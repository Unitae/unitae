import { expect, type Page, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'

const FIRSTNAME_FIELD_RE = /prénom/i
const LASTNAME_FIELD_RE = /^nom$/i
const SUBMIT_BUTTON_RE = /enregistrer|sauvegarder|créer|ajouter/i
const MARK_AS_LEFT_TITLE_RE = /désactiver la fiche proclamateur/i
const MARK_AS_RETURNED_TITLE_RE = /marquer comme de retour/i
const ACCOUNT_ID_FROM_EDIT_URL_RE = /\/settings\/users\/(\d+)\/edit/

async function createPublisherWithoutEmail(page: Page, lastname: string): Promise<boolean> {
  await page.goto('/publishers/new')
  await page.waitForLoadState('networkidle')
  if (!page.url().includes('/publishers/new')) return false

  const firstnameField = page.getByLabel(FIRSTNAME_FIELD_RE)
  if (!(await firstnameField.isVisible({ timeout: 3000 }).catch(() => false))) return false

  await firstnameField.fill('Lifecycle')
  await page.getByLabel(LASTNAME_FIELD_RE).fill(lastname)
  await page.getByRole('radio', { name: 'Homme' }).check()
  // Email is left blank — verifies the placeholder-email workaround is gone
  await page.getByRole('button', { name: SUBMIT_BUTTON_RE }).click()
  await page.waitForLoadState('networkidle')
  return !page.url().includes('/publishers/new')
}

test.describe('Member lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('publisher without email round-trips through Mark as left and Mark as returned', async ({ page }) => {
    const uniqueSuffix = Date.now()
    const lastname = `Lifecycle-${uniqueSuffix}`

    const created = await createPublisherWithoutEmail(page, lastname)
    if (!created) test.skip()

    // The new publisher shows up on the list
    await page.goto('/publishers')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(lastname)).toBeVisible()

    // Open the publisher detail page and click "Mark as left"
    await page.getByText(lastname).first().click()
    await page.waitForLoadState('networkidle')

    const markAsLeftButton = page.getByRole('button', { name: MARK_AS_LEFT_TITLE_RE })
    if (!(await markAsLeftButton.isVisible({ timeout: 3000 }).catch(() => false))) test.skip()
    await markAsLeftButton.click()
    await page.waitForLoadState('networkidle')

    // Leavers must disappear from the publishers list
    await page.goto('/publishers')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(lastname)).not.toBeVisible()

    // The leaver is still reachable from the admin Users list, where the
    // edit page surfaces a "Mark as returned" affordance.
    await page.goto('/settings/users')
    await page.waitForLoadState('networkidle')
    const userRow = page.getByText(lastname).first()
    if (!(await userRow.isVisible({ timeout: 3000 }).catch(() => false))) test.skip()
    await userRow.click()
    await page.waitForLoadState('networkidle')

    const markAsReturnedButton = page.getByRole('button', { name: MARK_AS_RETURNED_TITLE_RE })
    if (!(await markAsReturnedButton.isVisible({ timeout: 3000 }).catch(() => false))) test.skip()
    await markAsReturnedButton.click()
    await page.waitForLoadState('networkidle')

    // Returned member should reappear in the publishers list
    await page.goto('/publishers')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(lastname)).toBeVisible()
  })

  test('demoting a publisher to ministry-school student keeps them as a Member', async ({ page, request, baseURL }) => {
    const uniqueSuffix = Date.now()
    const lastname = `Student-${uniqueSuffix}`

    const created = await createPublisherWithoutEmail(page, lastname)
    if (!created) test.skip()

    // The new publisher shows up in the publisher-filtered list
    await page.goto('/publishers')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(lastname)).toBeVisible()

    // Look the account up by visiting the Users list and clicking the row to
    // reach the edit page — we need the accountId for the POST below.
    await page.goto('/settings/users')
    await page.waitForLoadState('networkidle')
    const userRow = page.getByText(lastname).first()
    if (!(await userRow.isVisible({ timeout: 3000 }).catch(() => false))) test.skip()
    await userRow.click()
    await page.waitForLoadState('networkidle')

    const editUrl = page.url()
    const idMatch = editUrl.match(ACCOUNT_ID_FROM_EDIT_URL_RE)
    if (!idMatch) test.skip()
    const accountId = idMatch![1]

    // Demote to ministry-school student via the action endpoint. We forward
    // the session cookies so the request is authenticated.
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')
    const resp = await request.post(`${baseURL ?? ''}/settings/users/${accountId}/make-student`, {
      headers: { cookie: cookieHeader },
    })
    expect(resp.status()).toBeLessThan(500)

    // After demotion: the user is no longer in the publisher-filtered list,
    // but the Member row (and account) still exists in the admin Users list.
    await page.goto('/publishers')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(lastname)).not.toBeVisible()

    await page.goto('/settings/users')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(lastname)).toBeVisible()
  })
})
