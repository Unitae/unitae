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
}

const APP_ROOT = resolve(import.meta.dirname, '../..')
const ENTRY_POINT = /HelpEntryButton slug="([a-z0-9-]+)"/g
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

  it('opens only articles that ship in both languages', () => {
    for (const slug of new Set(Object.values(PINS))) {
      for (const locale of ['fr', 'en'] as const) {
        expect(ARTICLES.some(article => article.locale === locale && article.slug === slug)).toBe(true)
      }
    }
  })
})
