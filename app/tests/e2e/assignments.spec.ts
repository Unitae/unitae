import { expect, type Locator, type Page, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

// The whole path of an assignment, as whoever prepares the programmes walks it: a part and a service given to a
// publisher, the programme published, the board's programme showing them, then unpublished and gone from the board.
// Each run creates its own publisher and picks a meeting far ahead, so reruns rarely share one — and reuse it when they
// do. The board document is this spec's own, found by its title: another document's settings never decide the result.

const TIME_ZONE = 'Europe/Paris'
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TUESDAY = 2
const SINGLE_RE = /^Une seule date$/
const SUBMIT_SINGLE_RE = /^Créer le programme$/
const MIDWEEK_RE = /^Réunion de semaine/
// Created, a programme opens on the meeting's page.
const EVENT_URL_RE = /\/programs\/events\/(\d+)(?:[?#]|$)/
const PUBLISHER_FORM_SUBMIT_RE = /enregistrer|sauvegarder|créer|ajouter/i
const DOCUMENT_TITLE = 'Programme des réunions (E2E)'
const FIRSTNAME_RE = /prénom/i
const BOARD_DOCUMENTS_URL_RE = /\/board\/documents$/
const LASTNAME_RE = /^nom$/i
const NEW_PUBLISHER_URL_RE = /\/publishers\/new/

function localWeekday(date: Date): number {
  return WEEKDAYS.indexOf(new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short' }).format(date))
}

/** A Tuesday between one and three years ahead, as typed in a date field: a meeting of this run's own. */
function farTuesday(): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + 400 + (Math.floor(Date.now() / 1000) % 700))
  while (localWeekday(date) !== TUESDAY) date.setUTCDate(date.getUTCDate() + 1)
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

async function retype(field: Locator, value: string) {
  await field.click()
  await field.press('ControlOrMeta+a')
  await field.pressSequentially(value)
  await field.press('Tab')
}

async function createPublisher(page: Page, firstname: string, lastname: string) {
  await page.goto('/publishers/new')
  await page.getByLabel(FIRSTNAME_RE).fill(firstname)
  await page.getByLabel(LASTNAME_RE).fill(lastname)
  await page.getByRole('button', { name: 'Frère', exact: true }).click()
  await page.getByRole('button', { name: PUBLISHER_FORM_SUBMIT_RE }).click()
  await expect(page).not.toHaveURL(NEW_PUBLISHER_URL_RE)
}

/** Creates the midweek programme on `typed`, or opens the one the day already has; returns its id. */
async function openMeeting(page: Page, typed: string): Promise<string> {
  await page.goto('/programs/new')
  await page.getByRole('button', { name: SINGLE_RE }).click()
  await page.getByText(MIDWEEK_RE).first().click()
  await retype(page.locator('#creation-day'), typed)
  await page.getByRole('button', { name: SUBMIT_SINGLE_RE }).click()
  const existing = page.getByRole('link', { name: 'Voir ce programme' })
  await Promise.race([page.waitForURL(EVENT_URL_RE), existing.waitFor()])
  if (!EVENT_URL_RE.test(page.url())) {
    await page.goto(`${await existing.getAttribute('href')}`)
    await page.waitForURL(EVENT_URL_RE)
  }
  const id = EVENT_URL_RE.exec(page.url())?.[1]
  if (!id) throw new Error(`no programme id in ${page.url()}`)
  return id
}

/** Gives a row of the programme to someone through its side panel, and waits for the row to show them. */
async function assign(page: Page, row: string, picker: 'Orateur' | 'Proclamateur', person: string) {
  await page.getByRole('button', { name: `Attribuer ${row}`, exact: true }).click()
  const panel = page.getByRole('complementary')
  await panel.getByRole('button', { name: picker }).click()
  await page.getByRole('combobox', { name: 'Rechercher par nom…' }).fill(person)
  await page.getByRole('option', { name: new RegExp(`^${person}`) }).click()
  await panel.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: row }).first().getByRole('link', { name: person })).toBeVisible()
  // The panel closes only once the save succeeded.
  await expect(panel).toBeHidden()
}

/** This spec's programme document — all meetings, parts and services — created, with a section if the board has none. */
async function programmeDocument(page: Page): Promise<string> {
  await page.goto('/board')
  const card = page.getByRole('link', { name: new RegExp(DOCUMENT_TITLE.replace(/[()]/g, '\\$&')) })
  if ((await card.count()) === 0) {
    await page.goto('/board/documents/new-dynamic?type=programme')
    const noSection = page.getByRole('link', { name: 'Créer une section' })
    const form = page.getByRole('textbox', { name: 'Titre' })
    await expect(noSection.or(form)).toBeVisible()
    if (await noSection.isVisible()) {
      await page.goto('/board/sections/new')
      await page.getByRole('textbox', { name: 'Nom' }).fill('Réunions')
      await page.getByRole('button', { name: 'Créer la section' }).click()
      await expect(page).toHaveURL(BOARD_DOCUMENTS_URL_RE)
      await page.goto('/board/documents/new-dynamic?type=programme')
    }
    await form.fill(DOCUMENT_TITLE)
    await page.getByRole('button', { name: 'Ajouter au tableau' }).click()
    await expect(page).toHaveURL(BOARD_DOCUMENTS_URL_RE)
    await page.goto('/board')
  }
  const href = await card.first().getAttribute('href')
  if (!href) throw new Error('the programme document has no link on the board')
  return href
}

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
    await page.goto(`/programs/events/${eventId}`)
    await assign(page, 'Lecture de la Bible', 'Orateur', person)
    await assign(page, 'Estrade', 'Proclamateur', person)

    // Each schedule publishes on its own; « Tout publier » publishes both (D43), each section then reads « Publié ».
    await page.getByRole('button', { name: 'Tout publier' }).click()
    await expect(page.getByRole('button', { name: 'Repasser en brouillon' })).toHaveCount(2)
    await expect(page.getByText(PUBLISHED_STATUS)).toHaveCount(2)

    // The board opened on this meeting, as a notice's link opens it.
    const viewer = `${await programmeDocument(page)}?eventId=${eventId}`
    await page.goto(viewer)
    const main = page.getByRole('main')
    await expect(page.getByRole('heading', { level: 1, name: DOCUMENT_TITLE })).toBeVisible()
    await expect(main.getByText('Lecture de la Bible')).toBeVisible()
    await expect(main.getByText(lastname).first()).toBeVisible()
    await expect(main.getByText(lastname)).toHaveCount(2)

    await page.goto(`/programs/events/${eventId}`)
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
