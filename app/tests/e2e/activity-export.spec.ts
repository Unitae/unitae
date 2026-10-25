import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

const TEST_EMAIL = E2E_ADMIN_EMAIL
const TEST_PASSWORD = E2E_ADMIN_PASSWORD

const exportYear = new Date().getFullYear()

const PDF_FILENAME_RE = /attachment;\s*filename="Activité-/
const XLSX_FILENAME_RE = /attachment;\s*filename="Activité-Proclamateurs-/

test.describe('Activity exports', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('PDF export route returns a ZIP attachment', async ({ page }) => {
    const response = await page.request.get(`/publishers/activity/export/pdfs?year=${exportYear}`)

    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/zip')
    expect(response.headers()['content-disposition']).toMatch(PDF_FILENAME_RE)

    const body = await response.body()
    expect(body.byteLength).toBeGreaterThan(0)
  })

  test('XLSX export route returns an Excel attachment', async ({ page }) => {
    const response = await page.request.get(`/publishers/activity/export/xlsx?year=${exportYear}`)

    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('vnd.ms-excel')
    expect(response.headers()['content-disposition']).toMatch(XLSX_FILENAME_RE)

    const body = await response.body()
    expect(body.byteLength).toBeGreaterThan(0)
  })
})
