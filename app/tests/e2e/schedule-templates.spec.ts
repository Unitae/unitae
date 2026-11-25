import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

// Réglages › « Modèles de planning »: a part added, changed and deleted in a template's panel shows in its list at
// once, after each save (its reload must not be dropped by the panel going back up a level).
const TEMPLATE_RE = /template=\d+/
const NEW_PART_RE = /item=new-part/
const PART_RE = /item=part-\d+/
const ANY_ITEM_RE = /item=/
const IN_SECTION_RE = /section=[^&]+/
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

    await page.getByRole('button', { name: 'Ajouter une partie hors section', exact: true }).click()
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

  test('starts a section with its first part, then adds one at its end, under its header', async ({ page }) => {
    const stamp = Date.now()
    const section = `Section e2e ${stamp}`
    await page.goto('/settings/schedule-templates')
    const programme = page.locator('[data-row-primary]').filter({ hasText: 'Spirituel' }).first()
    if ((await programme.count()) === 0) test.skip()
    await programme.click()
    await expect(page).toHaveURL(TEMPLATE_RE)
    const form = page.locator('form#part-edit-form')
    const save = async (name: string) => {
      await form.getByLabel('Nom', { exact: true }).fill(name)
      await page.getByRole('button', { name: 'Enregistrer la partie' }).click()
      await expect(page).not.toHaveURL(ANY_ITEM_RE)
    }

    await page.getByRole('button', { name: 'Ajouter une section', exact: true }).click()
    await page.getByPlaceholder('Nom de la section').fill(section)
    await page.getByPlaceholder('Nom de la section').press('Enter')
    await expect(page).toHaveURL(IN_SECTION_RE)
    await save(`Première e2e ${stamp}`)

    await page.getByRole('button', { name: `Ajouter une partie à ${section}`, exact: true }).click()
    await expect(page).toHaveURL(IN_SECTION_RE)
    await save(`Seconde e2e ${stamp}`)

    // Listed under its section's header, right before its « + Partie »: the section's last part.
    const first = page.getByRole('button', { name: new RegExp(`Première e2e ${stamp}`) })
    const second = page.getByRole('button', { name: new RegExp(`Seconde e2e ${stamp}`) })
    const boxes = await Promise.all([
      page.getByRole('button', { name: `Actions de la section ${section}` }).boundingBox(),
      first.boundingBox(),
      second.boundingBox(),
      page.getByRole('button', { name: `Ajouter une partie à ${section}` }).boundingBox(),
    ])
    const [header, firstBox, secondBox, add] = boxes
    if (header == null || firstBox == null || secondBox == null || add == null) throw new Error('not listed')
    expect([header.y < firstBox.y, firstBox.y < secondBox.y, secondBox.y < add.y]).toEqual([true, true, true])

    // The section goes with its last part.
    for (const row of [second, first]) {
      await row.click()
      await page.getByRole('button', { name: 'Plus d’actions' }).click()
      await page.getByRole('menuitem', { name: 'Supprimer' }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: DELETE_RE }).click()
      await expect(row).toHaveCount(0)
    }
    await expect(page.getByRole('button', { name: `Actions de la section ${section}` })).toHaveCount(0)
  })
})
