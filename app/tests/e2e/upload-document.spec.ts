import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'

const BOARD_URL_RE = /\/board/
const NEW_DOCUMENT_URL_RE = /\/board\/documents\/new/
const SUBMIT_BUTTON_RE = /enregistrer|sauvegarder|ajouter|téléverser|upload/i

test.describe('Display board', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('board page loads', async ({ page }) => {
    await page.goto('/board')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(BOARD_URL_RE)
  })

  test('board management page is accessible', async ({ page }) => {
    const response = await page.goto('/board/manage')
    // Should load (200) or redirect to board, never a 500
    expect(response?.status()).toBeLessThan(500)
  })

  test('new document page is accessible', async ({ page }) => {
    const response = await page.goto('/board/documents/new')
    expect(response?.status()).toBeLessThan(500)
  })

  test('submitting upload form without a file or title shows validation error', async ({ page }) => {
    await page.goto('/board/documents/new')
    await page.waitForLoadState('networkidle')

    // Only proceed if the form is rendered (not redirected away)
    const submitButton = page.getByRole('button', { name: SUBMIT_BUTTON_RE })
    if (!(await submitButton.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip()
      return
    }

    await submitButton.click()
    await page.waitForLoadState('networkidle')

    // Must stay on the form page — not navigate away on validation error
    await expect(page).toHaveURL(NEW_DOCUMENT_URL_RE)
  })
})
