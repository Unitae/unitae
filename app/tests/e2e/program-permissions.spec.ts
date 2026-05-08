import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const MANAGER_EMAIL = process.env.E2E_PROGRAM_MANAGER_EMAIL
const MANAGER_PASSWORD = process.env.E2E_PROGRAM_MANAGER_PASSWORD
const RESPONSIBLE_EMAIL = process.env.E2E_PROGRAM_RESPONSIBLE_EMAIL
const RESPONSIBLE_PASSWORD = process.env.E2E_PROGRAM_RESPONSIBLE_PASSWORD
const VIEWER_EMAIL = process.env.E2E_PROGRAM_VIEWER_EMAIL
const VIEWER_PASSWORD = process.env.E2E_PROGRAM_VIEWER_PASSWORD

const PROGRAMS_URL_RE = /\/programs(\?|$)/
const PROGRAMS_NEW_URL_RE = /\/programs\/new/
const NEW_EVENT_BUTTON_RE = /^Nouvel? /i
const NO_TEMPLATE_OPTION_RE = /Aucun modèle/i

test.describe('Program permissions — ProgramManager', () => {
  test.beforeEach(async ({ page }) => {
    if (!MANAGER_EMAIL || !MANAGER_PASSWORD) test.skip()
    const loggedIn = await login(page, MANAGER_EMAIL ?? '', MANAGER_PASSWORD ?? '')
    if (!loggedIn) test.skip()
  })

  test('sees the "Nouveau" button on the program list', async ({ page }) => {
    await page.goto('/programs')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('link', { name: NEW_EVENT_BUTTON_RE })).toBeVisible()
  })

  test('new-event page exposes the "Aucun modèle" option', async ({ page }) => {
    await page.goto('/programs/new')
    await page.waitForLoadState('networkidle')
    await page.getByRole('combobox').first().click()
    await expect(page.getByRole('option', { name: NO_TEMPLATE_OPTION_RE })).toBeVisible()
  })
})

test.describe('Program permissions — Responsible (non-manager)', () => {
  test.beforeEach(async ({ page }) => {
    if (!RESPONSIBLE_EMAIL || !RESPONSIBLE_PASSWORD) test.skip()
    const loggedIn = await login(page, RESPONSIBLE_EMAIL ?? '', RESPONSIBLE_PASSWORD ?? '')
    if (!loggedIn) test.skip()
  })

  test('sees the "Nouveau" button on the program list', async ({ page }) => {
    await page.goto('/programs')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('link', { name: NEW_EVENT_BUTTON_RE })).toBeVisible()
  })

  test('new-event page does not expose the "Aucun modèle" option', async ({ page }) => {
    await page.goto('/programs/new')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(PROGRAMS_NEW_URL_RE)
    await page.getByRole('combobox').first().click()
    await expect(page.getByRole('option', { name: NO_TEMPLATE_OPTION_RE })).toHaveCount(0)
  })

  test('foreign-template event ids are filtered out by the bulk-delete action', async ({ page, request }) => {
    await page.goto('/programs')
    await page.waitForLoadState('networkidle')

    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')

    const response = await request.post('/programs/bulk-delete', {
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      data: { ids: [-1, -2] },
    })
    expect(response.ok()).toBeTruthy()
    const body = (await response.json()) as { ok: boolean; deleted?: number }
    expect(body.ok).toBe(true)
    expect(body.deleted ?? 0).toBe(0)
  })
})

test.describe('Program permissions — ProgramViewer (read-only)', () => {
  test.beforeEach(async ({ page }) => {
    if (!VIEWER_EMAIL || !VIEWER_PASSWORD) test.skip()
    const loggedIn = await login(page, VIEWER_EMAIL ?? '', VIEWER_PASSWORD ?? '')
    if (!loggedIn) test.skip()
  })

  test('does not see the "Nouveau" button on the program list', async ({ page }) => {
    await page.goto('/programs')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('link', { name: NEW_EVENT_BUTTON_RE })).toHaveCount(0)
  })

  test('cannot reach /programs/new — redirected to /programs', async ({ page }) => {
    await page.goto('/programs/new')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(PROGRAMS_URL_RE)
  })
})
