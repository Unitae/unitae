import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadHelpArticles } from '~/features/help/server/help-content.server'

// The authoritative wiring of the « ? » entry points: every page that shows one, and the article it opens. A new
// entry point needs a line here; a removed one needs its line removed. The scan below enforces both directions. A page
// whose header depends on the reader's rights lists one article per header.
const PINS: Record<string, string | string[]> = {
  'features/events/routes/days-off/list.tsx': 'absences',
  'features/territories/routes/my-territories/list.tsx': 'my-territories',
  'features/territories/routes/territory/list.tsx': 'create-territory',
  'features/territories/routes/territory/new.tsx': 'create-territory',
  // The editor draws its own title: its « ? » goes in the top bar, and in the column on a phone.
  'features/territories/routes/territory/edit.tsx': 'split-territory',
  'features/territories/routes/split-tool/batch.tsx': 'batch-territories',
  'features/territories/routes/territory/view.tsx': 'territory-card',
  'features/territories/routes/attributions/list.tsx': 'territory-attributions',
  'features/territories/routes/attributions/territories.tsx': 'territory-attributions',
  'features/territories/routes/stats/index.tsx': 'territory-stats',
  'features/display-board/routes/index.tsx': 'board-read',
  // « Gérer le tableau » serves several rights: the « ? » opens the task of the first one the reader holds.
  'features/display-board/routes/documents/list.tsx': [
    'board-add-pdf',
    'board-dynamic',
    'board-sections',
    'board-reads',
  ],
  'features/display-board/routes/documents/new.tsx': 'board-add-pdf',
  'features/display-board/routes/documents/new-dynamic.tsx': 'board-dynamic',
  'features/display-board/routes/dynamic/edit.tsx': 'board-dynamic',
  'features/display-board/routes/sections/new.tsx': 'board-sections',
  'features/display-board/routes/sections/edit.tsx': 'board-sections',
  'features/territories/routes/campaigns/list.tsx': 'campaign-create',
  'features/territories/routes/prospection/list.tsx': 'prospection',
  'features/settings/routes/territories/settings.tsx': 'territories-settings',
  'features/authentication/routes/user/profile.tsx': 'calendar-feed',
  'features/authentication/routes/user/preferences.tsx': 'language',
  'features/authentication/routes/user/security.tsx': 'password',
  'features/notifications/routes/preferences.tsx': 'notifications',
  'features/authentication/routes/user/privacy.tsx': 'my-data',
  'features/events/routes/programs/external-speakers/list.tsx': 'external-speakers',
  'features/events/routes/programs/external-speakers/ours.tsx': 'external-speakers',
  // Who may only enter attendance gets today's meetings; who may read it gets the service year and its exports.
  'features/events/routes/attendance/index.tsx': ['attendance-entry', 'attendance-s88'],
  'features/publishers/routes/publishers/publisher-list.tsx': 'publisher-arrivals-departures',
  'features/publishers/routes/publishers/new-publisher.tsx': 'publisher-arrivals-departures',
  'features/publishers/routes/publishers/publisher.tsx': 'publisher-arrivals-departures',
  'features/publishers/routes/publishers/group-list.tsx': 'groups',
  'features/publishers/routes/publishers/new-group.tsx': 'groups',
  'features/publishers/routes/publishers/edit-group.tsx': 'groups',
  // « Mon groupe » too: its overseer and assistant enter the group's reports from it.
  'features/publishers/routes/publishers/group.tsx': 'field-service-reports',
  'features/publishers/routes/activity/publisher-list.tsx': 'field-service-reports',
  'features/publishers/routes/activity/pioneers.tsx': 'pioneers',
  'features/settings/routes/users/user-list.tsx': 'invite-user',
  'features/settings/routes/users/account.tsx': 'give-rights',
  'features/settings/routes/roles.tsx': 'give-rights',
  'features/settings/routes/data/settings.tsx': 'congregation-data',
  'features/settings/routes/audit-log.tsx': 'audit-log',
  'features/settings/routes/schedule-templates.tsx': 'schedule-templates',
  // The organigram's screens draw their own heading: the « ? » goes in the top bar, and beside the title on a phone.
  'features/congregation/routes/roles/organigram.tsx': 'organigram',
  'features/congregation/routes/roles/role-list.tsx': 'organigram',
}

// The routes with a loader matched above the pinned pages (see app/routes.ts).
const LAYOUTS_ABOVE_ENTRY_POINTS = [
  'root.tsx',
  'shell/_authenticated-layout.tsx',
  'features/authentication/routes/user/_layout.tsx',
  'features/display-board/routes/_layout.tsx',
  'features/territories/routes/_layout.tsx',
  'features/settings/routes/_layout.tsx',
]

const APP_ROOT = resolve(import.meta.dirname, '../..')
const ENTRY_POINT = /HelpEntryButton slug="([a-z0-9-]+)"/g
// The slot holds the button, or a component of the page (`…Help`) choosing between buttons by the reader's rights.
const HELP_SLOT = /help=\{<(?:HelpEntryButton slug="|[A-Z]\w*Help\b)/
const PANEL_REVALIDATION = 'export { skipRevalidationForHelpPanel as shouldRevalidate }'
// A page that decides its own revalidation asks the same question first.
const OWN_REVALIDATION =
  /export function shouldRevalidate\(args: ShouldRevalidateFunctionArgs\) \{\n(?:.*\n){0,3}?.*if \(onlyHelpPanelChanged\(args\)\) return false/
const ARTICLES = loadHelpArticles()

function scanEntryPoints(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>()
  const files = readdirSync(APP_ROOT, { recursive: true }) as string[]

  for (const file of files) {
    if (!file.endsWith('.tsx') || file.endsWith('.test.tsx')) continue
    const source = readFileSync(resolve(APP_ROOT, file), 'utf8')
    for (const match of source.matchAll(ENTRY_POINT)) {
      const slugs = found.get(file) ?? new Set<string>()
      slugs.add(match[1])
      found.set(file, slugs)
    }
  }

  return found
}

describe('the « ? » entry points, wired from the app source', () => {
  const scanned = scanEntryPoints()

  it('matches the pinned pages exactly: no unpinned entry point, no missing one', () => {
    expect([...scanned.keys()].sort()).toEqual(Object.keys(PINS).sort())
  })

  for (const [file, pinned] of Object.entries(PINS)) {
    const slugs = [pinned].flat().sort()
    it(`opens « ${slugs.join(' », « ')} » from ${file}`, () => {
      expect([...(scanned.get(file) ?? [])].sort()).toEqual(slugs)
    })
  }

  it('puts each « ? » in the header’s help slot, which keeps it off a row of its own on a phone', () => {
    for (const file of Object.keys(PINS)) {
      expect(readFileSync(resolve(APP_ROOT, file), 'utf8')).toMatch(HELP_SLOT)
    }
  })

  // One route that reloads is enough to send the request: the page and every layout above it keep their data.
  it('keeps the page data when the panel opens, on each page and every layout above it', () => {
    for (const file of [...Object.keys(PINS), ...LAYOUTS_ABOVE_ENTRY_POINTS]) {
      const source = readFileSync(resolve(APP_ROOT, file), 'utf8')
      expect(source.includes(PANEL_REVALIDATION) || OWN_REVALIDATION.test(source), file).toBe(true)
    }
  })

  it('opens only articles that ship in both languages', () => {
    for (const slug of new Set(Object.values(PINS).flat())) {
      for (const locale of ['fr', 'en'] as const) {
        expect(ARTICLES.some(article => article.locale === locale && article.slug === slug)).toBe(true)
      }
    }
  })
})
