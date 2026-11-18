import { expect, type Locator, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers/auth'

// Declaring an absence in « Mes absences », reading it on the congregation's absences page, deleting it. Each run
// picks its own days far ahead, so a second run never meets the first one's absence.

const TIME_ZONE = 'Europe/Paris'
const MY_ABSENCES_URL_RE = /\/me\/days-off$/

interface Day {
  /** As typed in a date field. */
  typed: string
  /** As the lists write a single day. */
  written: string
  weekday: string
  dayOfMonth: number
  monthAndYear: string
  /** As the address of the absences page takes it. */
  iso: string
}

function day(offset: number): Day {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offset)
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, ...options }).format(date)
  const typed = format({ day: '2-digit', month: '2-digit', year: 'numeric' })
  const [dd, mm, yyyy] = typed.split('/')
  return {
    typed,
    written: format({ weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }),
    weekday: format({ weekday: 'short' }),
    dayOfMonth: Number(dd),
    monthAndYear: format({ month: 'long', year: 'numeric' }),
    iso: `${yyyy}-${mm}-${dd}`,
  }
}

/** A range within one month, as the lists write it: « ven. 2 – dim. 4 juin 2028 ». */
function range(first: Day, last: Day): string {
  return `${first.weekday} ${first.dayOfMonth} – ${last.weekday} ${last.dayOfMonth} ${last.monthAndYear}`
}

/** Types into a date field the way a person does, replacing what it holds; the field commits when left. */
async function retype(field: Locator, value: string) {
  await field.click()
  await field.press('ControlOrMeta+a')
  await field.pressSequentially(value)
  await field.press('Tab')
}

test.describe('Absences', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD)
    if (!loggedIn) test.skip()
  })

  test('declares an absence, finds it on the congregation page, then deletes it', async ({ page }) => {
    // Three days, somewhere between one and two years ahead: a run of its own.
    let offset = 400 + (Math.floor(Date.now() / 1000) % 300)
    // Tuesday to Thursday of one week and one month: the range reads as one, and the page lists it under one week.
    while (day(offset).weekday !== 'mar.' || day(offset).dayOfMonth > 26) offset++
    const first = day(offset)
    const last = day(offset + 2)
    const written = range(first, last)

    await page.goto('/me/days-off/new')
    await retype(page.getByRole('textbox', { name: 'Premier jour' }), first.typed)
    await retype(page.getByRole('textbox', { name: 'Dernier jour' }), last.typed)
    await page.getByRole('button', { name: 'Ajouter l’absence' }).click()

    await expect(page).toHaveURL(MY_ABSENCES_URL_RE)
    const mine = page.getByRole('region', { name: 'Mes absences' }).getByRole('listitem').filter({ hasText: written })
    await expect(mine).toContainText('3 jours')

    await page.goto(`/programs/days-off?from=${first.iso}&to=${last.iso}`)
    const listed = page.getByRole('region', { name: 'Absences, semaine par semaine' }).getByRole('listitem')
    await expect(listed.filter({ hasText: written })).toHaveCount(1)

    await page.goto('/me/days-off')
    await page.getByRole('button', { name: `Supprimer l’absence ${written}` }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer l’absence' }).click()
    // The row leaves at once; reading the page again proves the deletion was saved, not only shown.
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(async () => {
      await page.goto('/me/days-off')
      await expect(page.getByRole('button', { name: `Supprimer l’absence ${written}` })).toHaveCount(0, {
        timeout: 1000,
      })
    }).toPass()

    await page.goto(`/programs/days-off?from=${first.iso}&to=${last.iso}`)
    await expect(page.getByText(written)).toHaveCount(0)
  })
})
