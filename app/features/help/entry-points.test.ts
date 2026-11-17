import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadHelpArticles } from '~/features/help/server/help-content.server'

// Each page that shows a « ? », and the article that « ? » opens. Keep this in step with the pages.
const ENTRY_POINTS: Record<string, string> = {
  'app/features/events/routes/days-off/list.tsx': 'absences',
  'app/features/territories/routes/my-territories/list.tsx': 'my-territories',
  'app/features/territories/routes/territory/list.tsx': 'create-territory',
  'app/features/display-board/routes/index.tsx': 'board-read',
  'app/features/territories/routes/campaigns/list.tsx': 'campaign-create',
  'app/features/territories/routes/prospection/list.tsx': 'prospection',
  'app/features/settings/routes/territories/settings.tsx': 'territories-settings',
}

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const ARTICLES = loadHelpArticles()

describe('the « ? » entry points', () => {
  for (const [file, slug] of Object.entries(ENTRY_POINTS)) {
    it(`opens « ${slug} » from ${file}`, () => {
      const source = readFileSync(resolve(REPO_ROOT, file), 'utf8')

      expect(source).toContain(`<HelpEntryButton slug="${slug}" />`)
    })
  }

  it('point only at articles that ship in both languages', () => {
    for (const slug of new Set(Object.values(ENTRY_POINTS))) {
      for (const locale of ['fr', 'en'] as const) {
        expect(ARTICLES.some(article => article.locale === locale && article.slug === slug)).toBe(true)
      }
    }
  })
})
