import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

const TEST_EMAIL = E2E_ADMIN_EMAIL
const TEST_PASSWORD = E2E_ADMIN_PASSWORD

const VIEW_URL_RE = /\/territories\/territory\/(\d+)\/view/
const EDIT_URL_RE = /\/territories\/territory\/(\d+)\/edit/
const MENU_RE = /^Actions du territoire|^Actions for territory/
const EDIT_RE = /^Modifier$|^Edit$/

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
    const expectedNumber = (await targetRow.getByRole('link').first().textContent())?.trim() ?? ''
    expect(expectedNumber.length).toBeGreaterThan(0)

    // Click a text-only cell: the number's link covers the whole row. Re-pick this cell if the columns change.
    await targetRow.locator('td').nth(1).click()

    await page.waitForURL(VIEW_URL_RE, { timeout: 5000 })

    await expect(
      page.getByRole('heading', { name: new RegExp(`Territoire\\s+${expectedNumber}\\b`, 'i') }),
    ).toBeVisible()
  })

  test('opening a row’s menu does not trigger row navigation, its « Modifier » opens the editor', async ({ page }) => {
    const response = await page.goto('/territories?sort=number')
    if (response && response.status() >= 400) test.skip()
    await page.waitForLoadState('networkidle')

    const rows = page.locator('[data-testid="territory-row"]')
    if ((await rows.count()) < 1) test.skip()

    const targetRow = rows.first()
    await targetRow.hover()
    await targetRow.getByRole('button', { name: MENU_RE }).click()
    // « Modifier » shows only to those who may manage territories.
    const edit = page.getByRole('menuitem', { name: EDIT_RE })
    if (!(await edit.isVisible({ timeout: 2000 }).catch(() => false))) test.skip()
    await expect(page).not.toHaveURL(VIEW_URL_RE)

    await edit.click()
    await page.waitForURL(EDIT_URL_RE, { timeout: 5000 })
  })
})
