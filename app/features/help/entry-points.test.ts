import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadHelpArticles } from '~/features/help/server/help-content.server'

// The authoritative wiring of the « ? » entry points: every page that shows one, and the article it opens. A new
// entry point needs a line here; a removed one needs its line removed. The scan below enforces both directions.
const PINS: Record<string, string> = {
  'features/events/routes/days-off/list.tsx': 'absences',
  'features/territories/routes/my-territories/list.tsx': 'my-territories',
  'features/territories/routes/territory/list.tsx': 'create-territory',
  'features/display-board/routes/index.tsx': 'board-read',
  'features/territories/routes/campaigns/list.tsx': 'campaign-create',
  'features/territories/routes/prospection/list.tsx': 'prospection',
  'features/settings/routes/territories/settings.tsx': 'territories-settings',
  'features/authentication/routes/user/profile.tsx': 'calendar-feed',
  'features/authentication/routes/user/preferences.tsx': 'language',
  'features/authentication/routes/user/security.tsx': 'password',
  'features/notifications/routes/preferences.tsx': 'notifications',
  'features/authentication/routes/user/privacy.tsx': 'my-data',
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
const HELP_SLOT = /help=\{<HelpEntryButton slug="/
const PANEL_REVALIDATION = 'export { skipRevalidationForHelpPanel as shouldRevalidate }'
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

  for (const [file, slug] of Object.entries(PINS)) {
    it(`opens « ${slug} » from ${file}`, () => {
      expect([...(scanned.get(file) ?? [])]).toEqual([slug])
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
      expect(readFileSync(resolve(APP_ROOT, file), 'utf8'), file).toContain(PANEL_REVALIDATION)
    }
  })

  it('opens only articles that ship in both languages', () => {
    for (const slug of new Set(Object.values(PINS))) {
      for (const locale of ['fr', 'en'] as const) {
        expect(ARTICLES.some(article => article.locale === locale && article.slug === slug)).toBe(true)
      }
    }
  })
})
