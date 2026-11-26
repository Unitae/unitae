import { expect, type Page, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

// Réglages › « Types d’évènement », a type in the side panel, « Plannings utilisés » (6b-2): a manager stops using a template, uses it again from
// « Utiliser un modèle », and moves it up and back down. Each change shows once its answer is back.
const REMOVE_RE = /^Retirer « (.+) »$/
const UP_RE = /^Monter /
const DOWN_RE = /^Descendre /
const TYPE_PAGE_RE = /\/settings\/templates\?type=\d+/

const saved = (page: Page) =>
  page.waitForResponse(
    response => response.request().method() === 'POST' && response.url().includes('/settings/templates'),
  )

test.describe('Meeting type: the schedule templates it uses', () => {
  test.use({ actionTimeout: 10_000 })

  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD)
    if (!loggedIn) test.skip()
    await page.setViewportSize({ width: 1440, height: 1000 })
  })

  test('removes a template, uses it again, and reorders', async ({ page }) => {
    await page.goto('/settings/templates')
    const type = page.getByRole('link', { name: 'Réunion du week-end' }).first()
    if ((await type.count()) === 0) test.skip()
    await type.click()
    await page.waitForURL(TYPE_PAGE_RE)
    const removes = page.getByRole('button', { name: REMOVE_RE })
    // The panel's rows come with the type's data: wait for them before counting.
    await expect(removes.first()).toBeVisible()
    if ((await removes.count()) < 2) test.skip()
    const titles = async () =>
      Promise.all(
        (await removes.all()).map(async each => (await each.getAttribute('aria-label'))?.match(REMOVE_RE)?.[1] ?? ''),
      )
    const before = await titles()
    const last = before[before.length - 1]
    // Unnamed templates share a title: the one removed is picked again by its id.
    const lastId = await page.locator('[data-schedule-template-id]').last().getAttribute('data-schedule-template-id')
    const again = (scope: ReturnType<Page['getByRole']>) => scope.locator(`[data-schedule-template-id="${lastId}"]`)

    try {
      await Promise.all([saved(page), removes.last().click()])
      await expect(removes).toHaveCount(before.length - 1)
      // The button pressed is gone: focus goes to the list, not the page's body.
      await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('SECTION')

      await page.getByRole('button', { name: 'Utiliser un modèle' }).click()
      const dialog = page.getByRole('dialog', { name: 'Utiliser un modèle de planning' })
      await Promise.all([saved(page), again(dialog).click()])
      await expect(removes).toHaveCount(before.length)
      await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('SECTION')
      expect(await titles()).toEqual(before)
      await expect(page.locator('[data-schedule-template-id]').last()).toHaveAttribute(
        'data-schedule-template-id',
        lastId ?? '',
      )

      await Promise.all([saved(page), page.getByRole('button', { name: UP_RE }).last().click()])
      await expect.poll(titles).toEqual([last, ...before.slice(0, -1)])
      await Promise.all([saved(page), page.getByRole('button', { name: DOWN_RE }).first().click()])
      await expect.poll(titles).toEqual(before)
    } finally {
      // Leaves the type as it found it, whatever failed above.
      if ((await titles()).length < before.length) {
        await page.getByRole('button', { name: 'Utiliser un modèle' }).click()
        await again(page.getByRole('dialog')).click()
      }
    }
  })

  // Another type opened while the name holds a change asks first; « Rester » keeps the change in the open type.
  test('asks before another type drops a change not saved', async ({ page }) => {
    await page.goto('/settings/templates')
    const first = page.getByRole('link', { name: 'Réunion du week-end' }).first()
    const other = page.getByRole('link', { name: 'Réunion de semaine' }).first()
    if ((await first.count()) === 0 || (await other.count()) === 0) test.skip()
    await first.click()
    await page.waitForURL(TYPE_PAGE_RE)
    const name = page.getByLabel('Nom')
    await name.fill('Réunion du week-end (brouillon)')
    await other.click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Rester' }).click()
    await expect(name).toHaveValue('Réunion du week-end (brouillon)')
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(name).toHaveValue('Réunion du week-end')
    // Closed with its ×, focus goes back to the type's row.
    await page.getByRole('button', { name: 'Fermer' }).click()
    await expect(first).toBeFocused()
  })

  // « Dupliquer » opens the copy; « Supprimer… » removes it and focus lands on the list, not the page's body.
  test('duplicates a type, deletes the copy, and puts focus on the list', async ({ page }) => {
    await page.goto('/settings/templates')
    const type = page.getByRole('link', { name: 'Réunion du week-end' }).first()
    if ((await type.count()) === 0) test.skip()
    await type.click()
    await page.waitForURL(TYPE_PAGE_RE)
    const original = page.url()
    await page.getByRole('button', { name: 'Plus d’actions' }).click()
    await page.getByRole('menuitem', { name: 'Dupliquer' }).click()
    await expect.poll(() => page.url()).not.toBe(original)
    await page.getByRole('button', { name: 'Supprimer…' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click()
    await expect.poll(() => page.url()).not.toContain('type=')
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.hasAttribute('data-row-primary') ?? false))
      .toBe(true)
  })
})
