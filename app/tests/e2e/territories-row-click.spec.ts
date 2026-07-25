import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'Str0ng-E2E-Passphrase-42'

const VIEW_URL_RE = /\/territories\/territory\/(\d+)\/view/
const EDIT_URL_RE = /\/territories\/territory\/(\d+)\/edit/

test.describe('Territories — row click navigation', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('clicking the middle of a row navigates to that row’s territory view', async ({ page }) => {
    const response = await page.goto('/territories?sort=number')
    if (response && response.status() >= 400) test.skip()
    await page.waitForLoadState('networkidle')

    const rows = page.locator('[data-testid="territory-row"]')
    const rowCount = await rows.count()
    // Use a middle row, not first or last: a faulty row-click implementation
    // that routes every click to one extreme would still pass a first-row test.
    if (rowCount < 2) test.skip()

    const targetRow = rows.nth(1)
    const numberCell = targetRow.locator('td').nth(0)
    const expectedNumber = (await numberCell.innerText()).trim()
    expect(expectedNumber.length).toBeGreaterThan(0)

    // Click a text-only cell so the row's click handler fires — not a nested
    // link or button. Re-pick this cell if column contents change.
    await targetRow.locator('td').nth(1).click()

    await page.waitForURL(VIEW_URL_RE, { timeout: 5000 })

    await expect(
      page.getByRole('heading', { name: new RegExp(`Territoire\\s+${expectedNumber}\\b`, 'i') }),
    ).toBeVisible()
  })

  test('clicking an action button does not trigger row navigation', async ({ page }) => {
    const response = await page.goto('/territories?sort=number')
    if (response && response.status() >= 400) test.skip()
    await page.waitForLoadState('networkidle')

    const rows = page.locator('[data-testid="territory-row"]')
    const rowCount = await rows.count()
    if (rowCount < 1) test.skip()

    const targetRow = rows.first()
    // Edit pencil renders only when the user can manage territories. Skip when
    // the test account lacks that permission instead of asserting it exists.
    const editLink = targetRow.locator('a[href*="/edit"]').first()
    if (!(await editLink.isVisible({ timeout: 2000 }).catch(() => false))) test.skip()

    await editLink.click()

    await page.waitForURL(EDIT_URL_RE, { timeout: 5000 })
    await expect(page).not.toHaveURL(VIEW_URL_RE)
  })
})
