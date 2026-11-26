import { expect, type Page, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

// Réglages › « Modèles de planning »: a part added, changed and deleted in a template's panel shows in its list at
// once, after each save (its reload must not be dropped by the panel going back up a level).
const TEMPLATE_RE = /template=\d+/
const NEW_PART_RE = /item=new-part/
const PART_RE = /item=part-\d+/
const ANY_ITEM_RE = /item=/
const SEVERAL_SERVICES_RE = /(?:[2-9]|\d{2,}) services/
const DOWN_RE = /^Descendre /
const IN_SECTION_RE = /section=[^&]+/
const DELETE_RE = /Supprimer/
const PARALLEL_RE = /En même temps dans plusieurs salles/
const WHOLE_RE = /Toute l’assemblée/
const ROOMS_TAG_RE = /[2-9] salles/

// The answer to a reorder posted from the page (not any other request).
const orderSaved = (page: Page) =>
  page.waitForResponse(
    response => response.request().method() === 'POST' && response.url().includes('/settings/schedule-templates'),
  )

test.describe('Schedule templates: a part in the template panel', () => {
  // An action waiting for something that never comes (a panel closed by a regression) fails here rather than at the
  // end of the test, so the cleanups in `finally` still have a page to work on.
  test.use({ actionTimeout: 10_000 })

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
    // A long walk through the page: room for its cleanup to run after a failure, before the page is closed.
    test.setTimeout(90_000)
    const stamp = Date.now()
    const section = `Ordre e2e ${stamp}`
    await page.goto('/settings/schedule-templates')
    const programme = page.locator('[data-row-primary]').filter({ hasText: 'Spirituel' }).first()
    if ((await programme.count()) === 0) test.skip()
    await programme.click()
    await expect(page).toHaveURL(TEMPLATE_RE)
    // Where the cleanup comes back to, whatever the test left open.
    const templateUrl = page.url()
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

    // A failed run deletes its parts too, so a retry starts from the same template.
    try {
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
      const saved = orderSaved(page)
      await page.keyboard.press('Space')
      expect((await saved).ok()).toBe(true)
      await page.reload()
      await expect.poll(() => above(beta, alpha)).toBe(true)

      // Escape while a part is lifted cancels the drag only: the panel stays open, on the same template.
      await page.getByRole('button', { name: `Déplacer Alpha e2e ${stamp}`, exact: true }).focus()
      await page.keyboard.press('Space')
      await expect(page.getByText(`« Alpha e2e ${stamp} » prise.`)).toBeAttached()
      // dnd-kit starts listening to the keyboard on the tick after the lift (a setTimeout in its KeyboardSensor);
      // an Escape sent within it goes unheard. A second one would close the panel, so wait the tick out once.
      await page.waitForTimeout(100)
      await page.keyboard.press('Escape')
      await expect(page.getByText(`Déplacement de « Alpha e2e ${stamp} » annulé.`)).toBeAttached()
      // A panel closing reloads the page's data: let that settle, or the address is read before it changes.
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL(TEMPLATE_RE)
      await expect(page.getByRole('button', { name: `Déplacer Alpha e2e ${stamp}`, exact: true })).toBeFocused()

      // On a phone: « Réorganiser les parties » (rows only move: nothing opens, nothing is added), « Descendre »,
      // the move said once saved, « Terminé », and the order kept on a reload.
      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByRole('button', { name: 'Réorganiser les parties' }).click()
      await expect(page.locator('[data-item^="part-"]')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Ajouter une partie hors section' })).toHaveCount(0)
      const down = orderSaved(page)
      await page.getByRole('button', { name: `Descendre Beta e2e ${stamp}`, exact: true }).click()
      expect((await down).ok()).toBe(true)
      await expect(page.getByText(`« Beta e2e ${stamp} » descendue d’une place.`)).toBeVisible()

      // A whole section up one place, then back: each move saved and kept on a reload.
      // Where the section sits, read after a reload each time: the sheet then starts at its top, so the two
      // positions are measured from the same scroll.
      const header = page.getByRole('button', { name: `Monter la section ${section}`, exact: true })
      const freshTop = async () => {
        await page.reload()
        await page.getByRole('button', { name: 'Réorganiser les parties' }).click()
        // The phone's sheet slides in after a reload: read once its animation is over (two equal reads alone can both
        // come before it starts), and has stopped moving.
        await page
          .locator('[data-slot="sheet-content"]')
          .evaluate(sheet => Promise.all(sheet.getAnimations().map(animation => animation.finished)))
        let last = Number.NaN
        await expect
          .poll(async () => {
            const y = (await header.boundingBox())?.y ?? Number.NaN
            const settled = y === last
            last = y
            return settled
          })
          .toBe(true)
        return last
      }
      const before = await freshTop()
      const up = orderSaved(page)
      await header.click()
      expect((await up).ok()).toBe(true)
      expect(await freshTop()).toBeLessThan(before)
      const back = orderSaved(page)
      await page.getByRole('button', { name: `Descendre la section ${section}`, exact: true }).click()
      expect((await back).ok()).toBe(true)
      await page.getByRole('button', { name: 'Terminé' }).click()
      await page.reload()
      await expect.poll(() => above(alpha, beta)).toBe(true)
    } finally {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.goto(templateUrl)
      await page.locator('[data-item^="part-"]').first().waitFor({ timeout: 10_000 })
      for (const row of [beta, alpha]) {
        if ((await row.count()) === 0) continue
        await row.click()
        await page.getByRole('button', { name: 'Plus d’actions' }).click()
        await page.getByRole('menuitem', { name: 'Supprimer' }).click()
        await page.getByRole('alertdialog').getByRole('button', { name: DELETE_RE }).click()
        await expect(page).not.toHaveURL(ANY_ITEM_RE)
        await expect(row).toHaveCount(0)
      }
    }
  })

  test('reorders a duties template’s services on a phone, and puts them back', async ({ page }) => {
    await page.goto('/settings/schedule-templates')
    // A duties template with two services or more: one with fewer has nothing to reorder.
    const duties = page.locator('[data-row-primary]').filter({ hasText: SEVERAL_SERVICES_RE }).first()
    if ((await duties.count()) === 0) test.skip()
    await duties.click()
    await expect(page).toHaveURL(TEMPLATE_RE)
    await page.setViewportSize({ width: 390, height: 844 })
    const reorder = page.getByRole('button', { name: 'Réorganiser les services' })
    const names = () =>
      page
        .getByRole('button', { name: DOWN_RE })
        .evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')?.replace('Descendre ', '')))
    await reorder.click()
    const before = await names()
    const [first, second] = before
    // A failed run puts the order back too, so the next one starts from the same template.
    try {
      const down = orderSaved(page)
      await page.getByRole('button', { name: `Descendre ${first}`, exact: true }).click()
      expect((await down).ok()).toBe(true)
      await expect(page.getByText(`« ${first} » descendu d’une place.`)).toBeVisible()
      await page.reload()
      await page.getByRole('button', { name: 'Réorganiser les services' }).click()
      expect((await names()).slice(0, 2)).toEqual([second, first])
    } finally {
      await page.reload()
      await page.getByRole('button', { name: 'Réorganiser les services' }).click()
      if ((await names())[0] !== first) {
        const up = orderSaved(page)
        await page.getByRole('button', { name: `Monter ${first}`, exact: true }).click()
        expect((await up).ok()).toBe(true)
      }
      await page.reload()
      await page.getByRole('button', { name: 'Réorganiser les services' }).click()
      expect(await names()).toEqual(before)
    }
  })

  test('adds a room, holds a part in it, takes it out after a confirmation, and deletes the room', async ({ page }) => {
    const room = `Salle e2e ${Date.now()}`
    const second = `Annexe e2e ${Date.now()}`
    const part = `Partie e2e ${Date.now()}`
    await page.goto('/settings/schedule-templates')
    const programme = page.locator('[data-row-primary]').filter({ hasText: 'Spirituel' }).first()
    if ((await programme.count()) === 0) test.skip()
    await programme.click()
    await expect(page).toHaveURL(TEMPLATE_RE)
    const templateUrl = page.url()
    const form = page.locator('form#part-edit-form')
    const row = page.getByRole('button', { name: new RegExp(`^${part}`) })
    const roomRow = page.getByText(room, { exact: true })
    try {
      // Escape clears a name being typed, and the panel stays.
      await page.getByPlaceholder('Nom de la salle').fill('Brouillon')
      await page.getByPlaceholder('Nom de la salle').press('Escape')
      await expect(page.getByPlaceholder('Nom de la salle')).toHaveValue('')
      await expect(page).toHaveURL(TEMPLATE_RE)
      await page.getByPlaceholder('Nom de la salle').fill(room)
      await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
      await expect(roomRow).toBeVisible()

      // A second room, moved above the first: the rooms after the main one take the order given.
      await page.getByPlaceholder('Nom de la salle').fill(second)
      await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
      const secondRow = page.getByText(second, { exact: true })
      await expect(secondRow).toBeVisible()
      await page.getByRole('button', { name: `Actions de la salle ${second}`, exact: true }).click()
      await expect(page.getByRole('menuitem', { name: 'Descendre' })).toHaveCount(0)
      await page.getByRole('menuitem', { name: 'Monter' }).click()
      await expect
        .poll(async () => ((await secondRow.boundingBox())?.y ?? 0) < ((await roomRow.boundingBox())?.y ?? 0))
        .toBe(true)
      await page.reload()
      await expect
        .poll(async () => ((await secondRow.boundingBox())?.y ?? 0) < ((await roomRow.boundingBox())?.y ?? 0))
        .toBe(true)

      // A new part in the whole congregation, then in the room too: the list says « N salles ».
      await page.getByRole('button', { name: 'Ajouter une partie hors section', exact: true }).click()
      await form.getByLabel('Nom', { exact: true }).fill(part)
      await page.getByRole('button', { name: 'Enregistrer la partie' }).click()
      await expect(page).not.toHaveURL(ANY_ITEM_RE)
      await row.click()
      await expect(page).toHaveURL(PART_RE)
      await form.getByRole('radio', { name: PARALLEL_RE }).click()
      // In several rooms with none ticked: not saved, said, and the first room takes focus.
      await page.getByRole('button', { name: 'Enregistrer la partie' }).click()
      await expect(form.getByRole('alert')).toContainText('Cochez au moins une autre salle')
      await expect(page).toHaveURL(PART_RE)
      await form.getByRole('checkbox', { name: room }).click()
      await page.getByRole('button', { name: 'Enregistrer la partie' }).click()
      await expect(page).not.toHaveURL(ANY_ITEM_RE)
      await expect(row).toContainText(ROOMS_TAG_RE)

      // Taken out of the room: the save asks first.
      await row.click()
      await expect(page).toHaveURL(PART_RE)
      await form.getByRole('radio', { name: WHOLE_RE }).click()
      await page.getByRole('button', { name: 'Enregistrer la partie' }).click()
      const confirm = page.getByRole('alertdialog')
      await expect(confirm).toContainText(room)
      await confirm.getByRole('button', { name: 'Retirer', exact: true }).click()
      await expect(page).not.toHaveURL(ANY_ITEM_RE)
      await expect(row).not.toContainText(ROOMS_TAG_RE)

      for (const name of [room, second]) {
        await page.getByRole('button', { name: `Actions de la salle ${name}`, exact: true }).click()
        await page.getByRole('menuitem', { name: 'Supprimer' }).click()
        await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer la salle' }).click()
        await expect(page.getByText(name, { exact: true })).toHaveCount(0)
      }
      await row.click()
      await page.getByRole('button', { name: 'Plus d’actions' }).click()
      await page.getByRole('menuitem', { name: 'Supprimer' }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: DELETE_RE }).click()
      await expect(row).toHaveCount(0)
    } finally {
      // Whatever failed: the template as it was, without the rooms or the part. The panel opens from the address once
      // the page runs: wait for it before looking for what to delete.
      await page.goto(templateUrl)
      await page.getByPlaceholder('Nom de la salle').waitFor({ timeout: 10_000 })
      for (const name of [room, second]) {
        const actions = page.getByRole('button', { name: `Actions de la salle ${name}`, exact: true })
        if ((await actions.count()) === 0) continue
        await actions.click()
        await page.getByRole('menuitem', { name: 'Supprimer' }).click()
        await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer la salle' }).click()
        await expect(page.getByText(name, { exact: true })).toHaveCount(0)
      }
      await page.locator('[data-item^="part-"]').first().waitFor({ timeout: 10_000 })
      if ((await row.count()) > 0) {
        await row.click()
        await page.getByRole('button', { name: 'Plus d’actions' }).click()
        await page.getByRole('menuitem', { name: 'Supprimer' }).click()
        await page.getByRole('alertdialog').getByRole('button', { name: DELETE_RE }).click()
        await expect(row).toHaveCount(0)
      }
    }
  })

  // « Nouveau modèle »: a refusal first, then the template, which opens in the panel with its empty list. Created once
  // and reused by later runs (the page cannot delete one yet), so a run leaves no template of its own behind.
  test('creates a schedule template after a refused name, and opens it with nothing in it', async ({ page }) => {
    const name = 'E2E Nouveau modèle'
    await page.goto('/settings/schedule-templates')
    const existing = page.locator('[data-row-primary]').filter({ hasText: name })
    if ((await existing.count()) === 0) {
      const open = page.getByRole('button', { name: 'Nouveau modèle', exact: true })
      await open.click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('Nom').fill('   ')
      await dialog.getByRole('button', { name: 'Programme des services' }).click()
      await dialog.getByRole('button', { name: 'Créer le modèle' }).click()
      await expect(dialog.getByRole('alert')).toContainText('Donnez-lui un nom.')
      await dialog.getByLabel('Nom').fill(name)
      await dialog.getByRole('button', { name: 'Créer le modèle' }).click()
      // Created once: the dialog goes, and focus is back on the button that opened it.
      await expect(dialog).toHaveCount(0)
      await expect(page).toHaveURL(TEMPLATE_RE)
      await expect(open).toBeFocused()
      // Opening it again starts afresh, without the old refusal.
      await open.click()
      await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0)
      await page.keyboard.press('Escape')
    } else {
      await existing.first().click()
    }
    await expect(page.locator('[data-row-primary]').filter({ hasText: name })).toHaveCount(1)
    // A template no kind uses shows its list, empty, with its first service to add.
    await expect(page.getByRole('button', { name: 'Ajouter un service' })).toBeVisible()
  })
})
