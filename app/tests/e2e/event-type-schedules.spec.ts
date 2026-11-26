import { expect, type Page, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

// Réglages › a meeting type's page, « Plannings utilisés » (6b-2): a manager stops using a template, uses it again from
// « Utiliser un modèle », and moves it up and back down. Each change shows once its answer is back.
const REMOVE_RE = /^Retirer « (.+) »$/
const UP_RE = /^Monter /
const DOWN_RE = /^Descendre /
const TYPE_PAGE_RE = /\/settings\/templates\/\d+/

const saved = (page: Page) =>
  page.waitForResponse(
    response => response.request().method() === 'POST' && response.url().includes('/settings/templates/'),
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
    await expect(page.getByText('Plannings utilisés')).toBeVisible()
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

      await page.getByRole('button', { name: 'Utiliser un modèle' }).click()
      const dialog = page.getByRole('dialog', { name: 'Utiliser un modèle de planning' })
      await Promise.all([saved(page), again(dialog).click()])
      await expect(removes).toHaveCount(before.length)
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
})
