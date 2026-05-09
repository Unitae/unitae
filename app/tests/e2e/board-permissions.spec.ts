import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const UPLOADER_EMAIL = process.env.E2E_BOARD_UPLOADER_EMAIL
const UPLOADER_PASSWORD = process.env.E2E_BOARD_UPLOADER_PASSWORD

const BOARD_URL_RE = /\/board(?:\?|$)/
const BOARD_DOCUMENTS_URL_RE = /\/board\/documents(?:\?|$)/
const BOARD_DOCUMENTS_NEW_URL_RE = /\/board\/documents\/new(?:\?|$)/
const NOT_BOARD_SECTIONS_URL_RE = /^(?!.*\/board\/sections).*$/

const MANAGE_DOCUMENTS_RE = /Gérer les documents|Manage documents/i
const MANAGE_SECTIONS_RE = /Gérer les sections|Manage sections/i
const UPLOAD_BUTTON_RE = /Téléverser/i
const ADD_DYNAMIC_RE = /Ajouter un document dynamique|Add dynamic document/i
const SIDEBAR_DOCUMENTS_RE = /^Documents$/
const SIDEBAR_SECTIONS_RE = /^Sections$/

// Use a non-existent ID so the test is independent of seed data — the permission
// check fires before the not-found lookup, so the redirect is observable either way.
const PHANTOM_ID = 99999999

test.describe('Board permissions — BoardUploader (upload-only)', () => {
  test.beforeEach(async ({ page }) => {
    if (!UPLOADER_EMAIL || !UPLOADER_PASSWORD) test.skip()
    const loggedIn = await login(page, UPLOADER_EMAIL ?? '', UPLOADER_PASSWORD ?? '')
    if (!loggedIn) test.skip()
  })

  test('board home shows "Manage Documents" but not "Manage Sections"', async ({ page }) => {
    await page.goto('/board')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(BOARD_URL_RE)

    await expect(page.getByRole('link', { name: MANAGE_DOCUMENTS_RE })).toBeVisible()
    await expect(page.getByRole('link', { name: MANAGE_SECTIONS_RE })).toHaveCount(0)
  })

  test('sidebar exposes Documents but not Sections', async ({ page }) => {
    await page.goto('/board')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('link', { name: SIDEBAR_DOCUMENTS_RE })).toBeVisible()
    await expect(page.getByRole('link', { name: SIDEBAR_SECTIONS_RE })).toHaveCount(0)
  })

  test('documents list loads with upload button and no management affordances', async ({ page }) => {
    await page.goto('/board/documents')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(BOARD_DOCUMENTS_URL_RE)

    // Upload entry-point is visible
    await expect(page.getByRole('link', { name: UPLOAD_BUTTON_RE })).toBeVisible()

    // Validator-only affordances are absent
    await expect(page.getByRole('link', { name: ADD_DYNAMIC_RE })).toHaveCount(0)
    // Bulk-select checkboxes (and the table header position cell) are validator-only
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(0)
  })

  test('upload form is reachable', async ({ page }) => {
    await page.goto('/board/documents/new')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(BOARD_DOCUMENTS_NEW_URL_RE)
    // Uploader's create form must not expose visibility-window inputs
    await expect(page.locator('input[name="visible-from"]')).toHaveCount(0)
    await expect(page.locator('input[name="visible-until"]')).toHaveCount(0)
    await expect(page.locator('input[name="hightlighted"]')).toHaveCount(0)
  })

  test('cannot reach /board/sections — redirected away', async ({ page }) => {
    await page.goto('/board/sections')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(NOT_BOARD_SECTIONS_URL_RE)
  })

  test('cannot reach /board/documents/new-dynamic — redirected away', async ({ page }) => {
    await page.goto('/board/documents/new-dynamic')
    await page.waitForLoadState('networkidle')
    expect(page.url()).not.toContain('/board/documents/new-dynamic')
  })

  // For docs the uploader didn't upload (here: a phantom id), the ownership
  // predicate fails, so edit/delete/versions all redirect away.
  test('cannot reach the edit page for a doc they do not own', async ({ page }) => {
    await page.goto(`/board/documents/${PHANTOM_ID}/edit`)
    await page.waitForLoadState('networkidle')
    expect(page.url()).not.toContain('/edit')
  })

  test('cannot reach the delete page for a doc they do not own', async ({ page }) => {
    await page.goto(`/board/documents/${PHANTOM_ID}/delete`)
    await page.waitForLoadState('networkidle')
    expect(page.url()).not.toContain('/delete')
  })

  test('cannot reach the versions page for a doc they do not own', async ({ page }) => {
    await page.goto(`/board/documents/${PHANTOM_ID}/versions`)
    await page.waitForLoadState('networkidle')
    expect(page.url()).not.toContain('/versions')
  })
})
