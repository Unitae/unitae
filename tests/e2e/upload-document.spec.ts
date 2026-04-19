import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@unitae.test'
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password'

const BOARD_HEADING_RE = /panneau|affichage|tableau/i
const BOARD_URL_RE = /\/board/
const ADD_LINK_RE = /ajouter|nouveau/i
const SUBMIT_RE = /enregistrer|créer|ajouter/i

test.describe("Panneau d'affichage", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_EMAIL, TEST_PASSWORD)
  })

  test("affiche le panneau d'affichage", async ({ page }) => {
    await page.goto('/board')
    await expect(page.getByRole('heading', { name: BOARD_HEADING_RE })).toBeVisible()
  })

  test('accede a la gestion des sections', async ({ page }) => {
    await page.goto('/board/sections')
    await expect(page).toHaveURL(BOARD_URL_RE)
  })

  test("accede au formulaire d'ajout de document", async ({ page }) => {
    await page.goto('/board/sections')
    const addLink = page.getByRole('link', { name: ADD_LINK_RE })
    if (await addLink.isVisible()) {
      await addLink.click()
      await expect(page.getByRole('button', { name: SUBMIT_RE })).toBeVisible()
    }
  })
})
