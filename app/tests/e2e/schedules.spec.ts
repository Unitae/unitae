import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'
import { assign, createPublisher, farTuesday, openMeeting, programmeDocument } from './helpers/programmes'

// Each schedule of a meeting publishes on its own (D8): the duties first, the board shows them alone and nothing of
// the draft programme (D45); the programme then, and the board shows both. A run's own publisher and meeting.

const DOCUMENT_TITLE = 'Programme des plannings (E2E)'
const DUTIES = /Devoirs$/
const PROGRAMME = /Programme$/

test.describe('Schedules', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('publishes the duties before the programme, and the board shows them alone, then both', async ({ page }) => {
    const lastname = `PLANNING${Date.now() % 1_000_000}`
    const person = `Mathis ${lastname}`
    await createPublisher(page, 'Mathis', lastname)

    // Days the assignments spec never draws from (it takes 400 to 1,100 days ahead).
    const eventId = await openMeeting(page, farTuesday(1200))
    await page.goto(`/programs/events/${eventId}`)
    await assign(page, 'Lecture de la Bible', 'Orateur', person)
    await assign(page, 'Estrade', 'Proclamateur', person)

    const duties = page.getByRole('region', { name: DUTIES })
    const programme = page.getByRole('region', { name: PROGRAMME })
    await duties.getByRole('button', { name: 'Publier', exact: true }).click()
    await expect(duties.getByRole('button', { name: 'Repasser en brouillon' })).toBeVisible()
    await expect(programme.getByRole('button', { name: 'Publier', exact: true })).toBeVisible()

    const viewer = `${await programmeDocument(page, DOCUMENT_TITLE)}?eventId=${eventId}`
    await page.goto(viewer)
    const main = page.getByRole('main')
    await expect(page.getByRole('heading', { level: 1, name: DOCUMENT_TITLE })).toBeVisible()
    // The duties alone: the person once, on the stage, and nothing of the draft programme.
    await expect(main.getByText(lastname)).toHaveCount(1)
    await expect(main.getByText('Lecture de la Bible')).toHaveCount(0)

    await page.goto(`/programs/events/${eventId}`)
    await programme.getByRole('button', { name: 'Publier', exact: true }).click()
    await expect(programme.getByRole('button', { name: 'Repasser en brouillon' })).toBeVisible()

    await page.goto(viewer)
    await expect(page.getByRole('heading', { level: 1, name: DOCUMENT_TITLE })).toBeVisible()
    await expect(main.getByText('Lecture de la Bible')).toBeVisible()
    await expect(main.getByText(lastname)).toHaveCount(2)

    // Back to drafts, so a rerun on the same meeting starts from nothing published.
    await page.goto(`/programs/events/${eventId}`)
    await page.getByRole('button', { name: 'Repasser en brouillon' }).first().click()
    await expect(page.getByRole('button', { name: 'Repasser en brouillon' })).toHaveCount(1)
    await page.getByRole('button', { name: 'Repasser en brouillon' }).click()
    await expect(page.getByRole('button', { name: 'Repasser en brouillon' })).toHaveCount(0)
  })
})
