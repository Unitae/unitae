import { describe, expect, it } from 'vitest'
import { GROUP_LEADER, HELP_LOCALES } from '~/features/help/model/help.type'
import type { HelpCaptureManifest } from '~/features/help/model/help-captures'
import { HelpArticleFormatError } from '~/features/help/model/parse-help-article'
import { assembleHelpArticles, loadHelpArticles } from '~/features/help/server/help-content.server'
import { Permission } from '~/shared/types/permission'

const HTML_TAG = /<\/?[a-z][^>]*>/i

// The first series, pinned: adding or removing an article is a deliberate change to this list.
const SHIPPED_SLUGS = [
  'absences',
  'activity-exports',
  'attendance-entry',
  'attendance-s88',
  'bano',
  'board-download',
  'board-read',
  'board-versions',
  'calendar-feed',
  'campaign-create',
  'create-territory',
  'emergency-roster',
  'external-speakers',
  'field-service-reports',
  'groups',
  'language',
  'my-data',
  'my-parts',
  'my-territories',
  'notifications',
  'password',
  'phone-territories',
  'pioneers',
  'prospection',
  'publisher-arrivals-departures',
  'territories-settings',
  'two-step-verification',
].sort()

interface ArticleOptions {
  title?: string
  module?: string
  permission?: string
  order?: number
  related?: string[]
  body?: string
}

function articleFile(slug: string, options: ArticleOptions = {}): string {
  const {
    title = `Titre ${slug}`,
    module = 'absences',
    permission = 'none',
    order = 1,
    related = [],
    body = 'Texte.',
  } = options
  return `---
slug: ${slug}
title: ${title}
summary: Résumé.
module: ${module}
permission: ${permission}
keywords:
related: ${related.join(', ')}
order: ${order}
---

${body}
`
}

// The same article in every language, as the repository ships it.
function pair(slug: string, options: ArticleOptions = {}): Record<string, string> {
  return Object.fromEntries(HELP_LOCALES.map(locale => [`content/${locale}/${slug}.md`, articleFile(slug, options)]))
}

// The article in every language but French, so a test can set the French one apart.
function besidesFrench(slug: string, options: ArticleOptions = {}): Record<string, string> {
  return Object.fromEntries(
    HELP_LOCALES.filter(locale => locale !== 'fr').map(locale => [
      `content/${locale}/${slug}.md`,
      articleFile(slug, options),
    ]),
  )
}

const CAPTURE = { width: 320, height: 120, captured: '2026-11-17' }
const BOTH_CAPTURED: HelpCaptureManifest = {
  fr: { 'absences-new': CAPTURE },
  en: { 'absences-new': CAPTURE },
  'pt-PT': { 'absences-new': CAPTURE },
}
const WITH_CAPTURE = { body: 'Texte.\n\n![Le bouton](capture:absences-new)' }

// An article shows only the app's own captures, described, and the same ones in both languages.
describe('assembleHelpArticles: the captures in a body', () => {
  it('accepts a described capture that both languages have', () => {
    expect(assembleHelpArticles(pair('a', WITH_CAPTURE), BOTH_CAPTURED).map(({ slug }) => slug)).toContain('a')
  })

  it('refuses a capture without alt text, which a screen reader could not describe', () => {
    expect(() => assembleHelpArticles(pair('a', { body: '![](capture:absences-new)' }), BOTH_CAPTURED)).toThrow(
      'alt text',
    )
  })

  it('refuses an image that is not one of the app’s captures', () => {
    expect(() =>
      assembleHelpArticles(pair('a', { body: '![Logo](https://example.org/logo.png)' }), BOTH_CAPTURED),
    ).toThrow('capture:')
  })

  it('refuses a capture the language does not have', () => {
    const frOnly = { ...BOTH_CAPTURED, en: {} }

    expect(() => assembleHelpArticles(pair('a', WITH_CAPTURE), frOnly)).toThrow('absences-new')
  })

  it('refuses captures that differ between the languages', () => {
    const sources = { 'content/fr/a.md': articleFile('a', WITH_CAPTURE), ...besidesFrench('a') }

    expect(() => assembleHelpArticles(sources, BOTH_CAPTURED)).toThrow('captures')
  })
})

describe('assembleHelpArticles: the shape of each file', () => {
  it('orders the articles by language, then by order, then by slug', () => {
    const articles = assembleHelpArticles({ ...pair('a'), ...pair('b', { order: 2 }) })

    expect(articles.map(({ locale, slug }) => `${locale}/${slug}`)).toEqual([
      'en/a',
      'en/b',
      'fr/a',
      'fr/b',
      'pt-PT/a',
      'pt-PT/b',
    ])
  })

  it('refuses a file outside a known language folder', () => {
    expect(() => assembleHelpArticles({ 'content/de/a.md': articleFile('a') })).toThrow('language folder')
  })

  it('refuses a file whose name is not its slug', () => {
    expect(() => assembleHelpArticles({ 'content/fr/other.md': articleFile('a'), ...besidesFrench('a') })).toThrow(
      'file name',
    )
  })
})

describe('assembleHelpArticles: the invariants across the two languages', () => {
  it('refuses a slug that exists in only one language', () => {
    expect(() => assembleHelpArticles({ 'content/fr/a.md': articleFile('a') })).toThrow('both languages')
  })

  it('refuses an article missing in French or in English, the two the help is written in', () => {
    const sources = { 'content/fr/a.md': articleFile('a'), 'content/pt-PT/a.md': articleFile('a') }

    expect(() => assembleHelpArticles(sources)).toThrow('both languages')
  })

  // A translation may trail behind: its readers get the English article, and the shipped-set test fails the build.
  it('accepts an article another language lacks, so the help still loads', () => {
    const sources = { 'content/fr/a.md': articleFile('a'), 'content/en/a.md': articleFile('a') }

    expect(assembleHelpArticles(sources).map(({ locale, slug }) => `${locale}/${slug}`)).toEqual(['en/a', 'fr/a'])
  })

  // A translation that fell behind its English article is set aside, never a reason to take the whole help down.
  describe('a translated article that no longer matches English', () => {
    const translatedKeys = (sources: Record<string, string>, onStale?: (error: HelpArticleFormatError) => void) =>
      assembleHelpArticles(sources, BOTH_CAPTURED, onStale)
        .filter(({ locale }) => locale === 'pt-PT')
        .map(({ slug }) => slug)

    it('is left out when its related set differs, and reported', () => {
      const reported: string[] = []
      const sources = { ...pair('b'), ...pair('a', { related: ['b'] }), 'content/pt-PT/a.md': articleFile('a') }

      expect(translatedKeys(sources, error => reported.push(error.message))).toEqual(['b'])
      expect(reported).toEqual([expect.stringContaining('related')])
    })

    it('is left out when its permission, module or order differs', () => {
      for (const options of [{ permission: 'CanViewBoard' }, { module: 'board' }, { order: 2 }]) {
        const sources = { ...pair('a'), 'content/pt-PT/a.md': articleFile('a', options) }

        expect(translatedKeys(sources)).toEqual([])
      }
    })

    it('is left out when it shows other captures than English', () => {
      const sources = { ...pair('a', WITH_CAPTURE), 'content/pt-PT/a.md': articleFile('a') }

      expect(translatedKeys(sources)).toEqual([])
    })

    it('is left out when it shows a capture its language does not have yet', () => {
      const captures = { ...BOTH_CAPTURED, 'pt-PT': {} }

      expect(
        assembleHelpArticles(pair('a', WITH_CAPTURE), captures).map(({ locale, slug }) => `${locale}/${slug}`),
      ).toEqual(['en/a', 'fr/a'])
    })

    it('is left out when English has no such article', () => {
      expect(translatedKeys({ ...pair('a'), 'content/pt-PT/orphan.md': articleFile('orphan') })).toEqual(['a'])
    })
  })

  it('accepts a related article that another language reads in English', () => {
    const sources = {
      ...pair('a', { related: ['b'] }),
      'content/fr/b.md': articleFile('b'),
      'content/en/b.md': articleFile('b'),
    }

    expect(
      assembleHelpArticles(sources)
        .filter(({ locale }) => locale === 'pt-PT')
        .map(({ slug }) => slug),
    ).toEqual(['a'])
  })

  it('refuses a permission that differs between the languages', () => {
    const sources = {
      'content/fr/a.md': articleFile('a', { permission: 'CanViewBoard' }),
      ...besidesFrench('a'),
    }

    expect(() => assembleHelpArticles(sources)).toThrow('permission')
  })

  it('accepts the same permissions listed in another order in each language', () => {
    const sources = {
      'content/fr/a.md': articleFile('a', { permission: 'CanViewBoard, CanReviewBoardDocuments' }),
      ...besidesFrench('a', { permission: 'CanReviewBoardDocuments, CanViewBoard' }),
    }

    expect(() => assembleHelpArticles(sources)).not.toThrow()
  })

  it('refuses a permission list that differs between the languages', () => {
    const sources = {
      'content/fr/a.md': articleFile('a', { permission: 'CanViewBoard, CanReviewBoardDocuments' }),
      ...besidesFrench('a', { permission: 'CanViewBoard' }),
    }

    expect(() => assembleHelpArticles(sources)).toThrow('permission')
  })

  it('refuses a module that differs between the languages', () => {
    const sources = { 'content/fr/a.md': articleFile('a', { module: 'board' }), ...besidesFrench('a') }

    expect(() => assembleHelpArticles(sources)).toThrow('module')
  })

  it('refuses an order that differs between the languages', () => {
    const sources = { 'content/fr/a.md': articleFile('a', { order: 2 }), ...besidesFrench('a') }

    expect(() => assembleHelpArticles(sources)).toThrow('order')
  })

  it('refuses a related set that differs between the languages', () => {
    const sources = {
      ...pair('b'),
      'content/fr/a.md': articleFile('a', { related: ['b'] }),
      ...besidesFrench('a'),
    }

    expect(() => assembleHelpArticles(sources)).toThrow('related')
  })

  it('accepts the same related set listed in another order', () => {
    const sources = {
      ...pair('b'),
      ...pair('c'),
      'content/fr/a.md': articleFile('a', { related: ['b', 'c'] }),
      ...besidesFrench('a', { related: ['c', 'b'] }),
    }

    expect(assembleHelpArticles(sources).map(({ slug }) => slug)).toContain('a')
  })

  it('refuses a related slug that does not exist', () => {
    expect(() => assembleHelpArticles(pair('a', { related: ['ghost'] }))).toThrow('ghost')
  })

  it('refuses an article that lists itself as related', () => {
    expect(() => assembleHelpArticles(pair('a', { related: ['a'] }))).toThrow('itself')
  })

  it('throws a format error, the one the layout knows how to survive', () => {
    expect(() => assembleHelpArticles(pair('a', { related: ['ghost'] }))).toThrow(HelpArticleFormatError)
  })
})

describe('loadHelpArticles: the articles as shipped', () => {
  const ARTICLES = loadHelpArticles()

  // The loader lets a language trail behind (its readers fall back to English); the build does not.
  it('ships the first series in every language, and only that series', () => {
    for (const locale of HELP_LOCALES) {
      expect(
        ARTICLES.filter(article => article.locale === locale)
          .map(({ slug }) => slug)
          .sort(),
      ).toEqual(SHIPPED_SLUGS)
    }
  })

  it('gives every article a permission that exists, leading a group, or none', () => {
    const names = new Set<string>([...Object.keys(Permission), GROUP_LEADER])

    for (const article of ARTICLES) {
      for (const permission of article.permission ?? []) expect(names.has(permission)).toBe(true)
    }
  })

  it('keeps the permission of each article tied to its feature', () => {
    const fr = new Map(ARTICLES.filter(article => article.locale === 'fr').map(article => [article.slug, article]))

    expect(fr.get('absences')?.permission).toBeNull()
    expect(fr.get('my-territories')?.permission).toBeNull()
    expect(fr.get('board-read')?.permission).toEqual(['CanViewBoard'])
    expect(fr.get('board-download')?.permission).toEqual(['CanViewBoard'])
    expect(fr.get('board-versions')?.permission).toEqual(['CanReviewBoardDocuments', 'CanUploadBoardDocuments'])
    expect(fr.get('phone-territories')?.permission).toEqual(['CanConfigureTerritorySettings'])
    expect(fr.get('territories-settings')?.permission).toEqual(['CanConfigureTerritorySettings'])
    expect(fr.get('bano')?.permission).toEqual(['CanConfigureTerritorySettings'])
    expect(fr.get('campaign-create')?.permission).toEqual(['CanManageTerritoryCampaigns'])
    expect(fr.get('prospection')?.permission).toEqual(['CanViewProspection'])
    expect(fr.get('external-speakers')?.permission).toEqual(['CanViewExternalSpeakers', 'CanManageExternalSpeakers'])
    expect(fr.get('attendance-entry')?.permission).toEqual(['CanRecordAttendance', 'CanCorrectAttendance'])
    expect(fr.get('attendance-s88')?.permission).toEqual(['CanViewAttendance'])
    // A group's overseer and assistant enter its reports and keep its emergency information without any right.
    expect(fr.get('field-service-reports')?.permission).toEqual([
      'CanRecordActivity',
      'CanCorrectActivity',
      'CanManagePublishers',
      'GroupLeader',
    ])
    expect(fr.get('emergency-roster')?.permission).toEqual([
      'CanViewEmergencyInfo',
      'CanManageEmergencyInfo',
      'GroupLeader',
    ])
    expect(fr.get('pioneers')?.permission).toEqual(['CanViewActivity', 'CanManagePublishers'])
    expect(fr.get('activity-exports')?.permission).toEqual(['CanViewActivity', 'CanRecordActivity'])
    expect(fr.get('publisher-arrivals-departures')?.permission).toEqual([
      'CanManagePublishers',
      'CanManagePublisherLifecycle',
    ])
    expect(fr.get('groups')?.permission).toEqual(['CanManagePublisherGroups'])
    for (const slug of [
      'my-parts',
      'password',
      'two-step-verification',
      'calendar-feed',
      'notifications',
      'language',
      'my-data',
    ]) {
      expect(fr.get(slug)?.permission, slug).toBeNull()
    }
  })

  it('writes no raw HTML in an article body', () => {
    for (const article of ARTICLES) {
      expect(article.body).not.toMatch(HTML_TAG)
    }
  })

  it('returns the same loaded set on every call', () => {
    expect(loadHelpArticles()).toBe(ARTICLES)
  })
})
