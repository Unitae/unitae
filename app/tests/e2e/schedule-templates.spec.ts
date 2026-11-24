import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

// Réglages › « Modèles de planning »: a part added, changed and deleted in a template's panel shows in its list at
// once, after each save (its reload must not be dropped by the panel going back up a level).
const TEMPLATE_RE = /template=\d+/
const NEW_PART_RE = /item=new-part/
const PART_RE = /item=part-\d+/
const ANY_ITEM_RE = /item=/
const ADD_PART_RE = /^Ajouter une partie/
const DELETE_RE = /Supprimer/

test.describe('Schedule templates: a part in the template panel', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD)
    if (!loggedIn) test.skip()
    await page.setViewportSize({ width: 1440, height: 1000 })
  })

  test('adds a part, shows a change to it, and deletes it', async ({ page }) => {
    const name = `Partie e2e ${Date.now()}`
    await page.goto('/settings/schedule-templates')
    const programme = page.locator('[data-row-primary]').filter({ hasText: 'Spirituel' }).first()
    if ((await programme.count()) === 0) test.skip()
    await programme.click()
    await expect(page).toHaveURL(TEMPLATE_RE)

    await page.getByRole('button', { name: ADD_PART_RE }).last().click()
    await expect(page).toHaveURL(NEW_PART_RE)
    // The part's own form, at the panel's second level.
    const form = page.locator('form#part-edit-form')
    await form.getByLabel('Nom', { exact: true }).fill(name)
    await page.getByRole('button', { name: 'Enregistrer la partie' }).click()
    await expect(page).not.toHaveURL(ANY_ITEM_RE)
    const row = page.getByRole('button', { name: new RegExp(name) })
    await expect(row).toBeVisible()

    await row.click()
    await expect(page).toHaveURL(PART_RE)
    await form.getByLabel('Durée (min)').fill('7')
    await page.getByRole('button', { name: 'Enregistrer la partie' }).click()
    await expect(page).not.toHaveURL(ANY_ITEM_RE)
    await expect(row).toContainText('7 min')

    await row.click()
    await page.getByRole('button', { name: 'Plus d’actions' }).click()
    await page.getByRole('menuitem', { name: 'Supprimer' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: DELETE_RE }).click()
    await expect(page).not.toHaveURL(ANY_ITEM_RE)
    await expect(row).toHaveCount(0)
  })
})
