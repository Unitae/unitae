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
    const row = page.getByRole('button', { name: new RegExp(`^${name}`) })
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
    const first = page.getByRole('button', { name: new RegExp(`^Première e2e ${stamp}`) })
    const second = page.getByRole('button', { name: new RegExp(`^Seconde e2e ${stamp}`) })
    const boxes = await Promise.all([
      page.getByRole('button', { name: `Actions de la section ${section}` }).boundingBox(),
      first.boundingBox(),
      second.boundingBox(),
      page.getByRole('button', { name: `Ajouter une partie à ${section}` }).boundingBox(),
    ])
    const [header, firstBox, secondBox, add] = boxes
    if (header == null || firstBox == null || secondBox == null || add == null) throw new Error('not listed')
    expect([header.y < firstBox.y, firstBox.y < secondBox.y, secondBox.y < add.y]).toEqual([true, true, true])

    // « n sur N » walks to the next part as the list shows it.
    await first.click()
    await page.getByRole('button', { name: 'Partie suivante' }).click()
    await expect(form.getByLabel('Nom', { exact: true })).toHaveValue(`Seconde e2e ${stamp}`)

    // Moved out of its section through the picker: it goes to the end of the parts outside any section, below it.
    await form.locator('#partSection').click()
    await page.getByRole('option', { name: 'Aucune section', exact: true }).click()
    await page.getByRole('button', { name: 'Enregistrer la partie' }).click()
    await expect(page).not.toHaveURL(ANY_ITEM_RE)
    const moved = await second.boundingBox()
    const sectionAdd = await page.getByRole('button', { name: `Ajouter une partie à ${section}` }).boundingBox()
    if (moved == null || sectionAdd == null) throw new Error('not listed')
    expect(moved.y).toBeGreaterThan(sectionAdd.y)

    // Moved into an earlier section through the picker: listed at that section's end, before its « + Partie ».
    const later = `Section e2e bis ${stamp}`
    await page.getByRole('button', { name: 'Ajouter une section', exact: true }).click()
    await page.getByPlaceholder('Nom de la section').fill(later)
    await page.getByPlaceholder('Nom de la section').press('Enter')
    await save(`Troisième e2e ${stamp}`)
    const third = page.getByRole('button', { name: new RegExp(`^Troisième e2e ${stamp}`) })
    await third.click()
    await form.locator('#partSection').click()
    await page.getByRole('option', { name: section, exact: true }).click()
    await page.getByRole('button', { name: 'Enregistrer la partie' }).click()
    await expect(page).not.toHaveURL(ANY_ITEM_RE)
    const [firstAt, thirdAt, endOfSection] = await Promise.all([
      first.boundingBox(),
      third.boundingBox(),
      page.getByRole('button', { name: `Ajouter une partie à ${section}` }).boundingBox(),
    ])
    if (firstAt == null || thirdAt == null || endOfSection == null) throw new Error('not listed')
    expect([firstAt.y < thirdAt.y, thirdAt.y < endOfSection.y]).toEqual([true, true])
    // Its own section went with its only part.
    await expect(page.getByRole('button', { name: `Actions de la section ${later}` })).toHaveCount(0)

    // The section goes with its last part.
    for (const row of [third, second, first]) {
      await row.click()
      await page.getByRole('button', { name: 'Plus d’actions' }).click()
      await page.getByRole('menuitem', { name: 'Supprimer' }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: DELETE_RE }).click()
      // Back on the list first: while a part is open, the list is not shown and no row would be found anyway.
      await expect(page).not.toHaveURL(ANY_ITEM_RE)
      await expect(row).toHaveCount(0)
    }
    await expect(page.getByRole('button', { name: `Actions de la section ${section}` })).toHaveCount(0)
  })

  test('reorders a section’s parts: dragged by keyboard, then up and down on a phone', async ({ page }) => {
    const stamp = Date.now()
    const section = `Ordre e2e ${stamp}`
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
    await save(`Alpha e2e ${stamp}`)
    await page.getByRole('button', { name: `Ajouter une partie à ${section}`, exact: true }).click()
    await save(`Beta e2e ${stamp}`)
    const alpha = page.getByRole('button', { name: new RegExp(`^Alpha e2e ${stamp}`) })
    const beta = page.getByRole('button', { name: new RegExp(`^Beta e2e ${stamp}`) })
    const above = async (upper: typeof alpha, lower: typeof alpha) => {
      const [a, b] = await Promise.all([upper.boundingBox(), lower.boundingBox()])
      return a != null && b != null && a.y < b.y
    }

    // By keyboard: Space lifts the part, the arrow moves it, Space drops it, and the order is saved.
    await page.getByRole('button', { name: `Déplacer Beta e2e ${stamp}`, exact: true }).focus()
    await page.keyboard.press('Space')
    await expect(page.getByText(`« Beta e2e ${stamp} » prise.`)).toBeAttached()
    // The list is measured just after the lift, and an arrow pressed before that moves nothing: press it again
    // until the lifted part is drawn on top (two parts: a second press cannot take it further), then drop.
    await expect
      .poll(async () => {
        await page.keyboard.press('ArrowUp')
        return above(beta, alpha)
      })
      .toBe(true)
    // The drop saves the new order: wait for its answer before reading the page again.
    const saved = page.waitForResponse(response => response.request().method() === 'POST')
    await page.keyboard.press('Space')
    expect((await saved).ok()).toBe(true)
    await page.reload()
    await expect.poll(() => above(beta, alpha)).toBe(true)

    // On a phone: « Réorganiser les parties », « Descendre », the move said, « Terminé ».
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Réorganiser les parties' }).click()
    await page.getByRole('button', { name: `Descendre Beta e2e ${stamp}`, exact: true }).click()
    await expect(page.getByText(`« Beta e2e ${stamp} » descendue d’une place.`)).toBeVisible()
    await page.getByRole('button', { name: 'Terminé' }).click()
    await expect.poll(() => above(alpha, beta)).toBe(true)

    await page.setViewportSize({ width: 1440, height: 1000 })
    for (const row of [beta, alpha]) {
      await row.click()
      await page.getByRole('button', { name: 'Plus d’actions' }).click()
      await page.getByRole('menuitem', { name: 'Supprimer' }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: DELETE_RE }).click()
      await expect(page).not.toHaveURL(ANY_ITEM_RE)
      await expect(row).toHaveCount(0)
    }
  })
})
