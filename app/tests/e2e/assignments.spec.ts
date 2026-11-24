import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'
import {
  assign,
  createPublisher,
  farTuesday,
  gotoMeeting,
  openMeeting,
  programmeDocument,
  publishAnyway,
} from './helpers/programmes'

// The whole path of an assignment, as whoever prepares the programmes walks it: a part and a service given to a
// publisher, the programme published, the board's programme showing them, then unpublished and gone from the board.
// Each run creates its own publisher and picks a meeting far ahead, so reruns rarely share one — and reuse it when they
// do. The board document is this spec's own, found by its title: another document's settings never decide the result.

const DOCUMENT_TITLE = 'Programme des réunions (E2E)'

// A schedule's section status once published: « Publié · 1 partie sur 15 attribuée ».
const PUBLISHED_STATUS = /^Publié ·/

test.describe('Assignments', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('assigns a part and a service, publishes, finds them on the board, then unpublishes', async ({ page }) => {
    const lastname = `ATTRIBUTION${Date.now() % 1_000_000}`
    const person = `Lucien ${lastname}`
    await createPublisher(page, 'Lucien', lastname)

    const eventId = await openMeeting(page, farTuesday())
    await gotoMeeting(page, eventId)
    await assign(page, 'Lecture de la Bible', 'Orateur', person)
    await assign(page, 'Estrade', 'Proclamateur', person)

    // Each schedule publishes on its own; « Tout publier » publishes both (D43), each section then reads « Publié ».
    await page.getByRole('button', { name: 'Tout publier' }).click()
    await publishAnyway(page)
    await expect(page.getByRole('button', { name: 'Repasser en brouillon' })).toHaveCount(2)
    await expect(page.getByText(PUBLISHED_STATUS)).toHaveCount(2)

    // The board opened on this meeting, as a notice's link opens it.
    const viewer = `${await programmeDocument(page, DOCUMENT_TITLE)}?eventId=${eventId}`
    await page.goto(viewer)
    const main = page.getByRole('main')
    await expect(page.getByRole('heading', { level: 1, name: DOCUMENT_TITLE })).toBeVisible()
    await expect(main.getByText('Lecture de la Bible')).toBeVisible()
    await expect(main.getByText(lastname).first()).toBeVisible()
    await expect(main.getByText(lastname)).toHaveCount(2)

    await gotoMeeting(page, eventId)
    // Each section withdraws its own schedule.
    await page.getByRole('button', { name: 'Repasser en brouillon' }).first().click()
    await expect(page.getByRole('button', { name: 'Repasser en brouillon' })).toHaveCount(1)
    await page.getByRole('button', { name: 'Repasser en brouillon' }).click()
    // The second withdrawal landed before the board is read: « Tout publier » shows from the first one already.
    await expect(page.getByRole('button', { name: 'Repasser en brouillon' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Tout publier' })).toBeVisible()

    // The document still opens; the meeting, a draft again, is no longer on it.
    await page.goto(viewer)
    await expect(page.getByRole('heading', { level: 1, name: DOCUMENT_TITLE })).toBeVisible()
    await expect(page.getByRole('main').getByText(lastname)).toHaveCount(0)
  })
})
