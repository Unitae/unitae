import { describe, expect, it } from 'vitest'
import { HelpArticleFormatError } from '~/features/help/model/parse-help-article'
import { assembleHelpArticles, loadHelpArticles } from '~/features/help/server/help-content.server'
import { Permission } from '~/shared/types/permission'

const HTML_TAG = /<\/?[a-z][^>]*>/i

// The first series, pinned: adding or removing an article is a deliberate change to this list.
const SHIPPED_SLUGS = [
  'absences',
  'bano',
  'board-download',
  'board-read',
  'board-versions',
  'campaign-create',
  'create-territory',
  'my-territories',
  'phone-territories',
  'prospection',
  'territories-settings',
].sort()

interface ArticleOptions {
  title?: string
  module?: string
  permission?: string
  order?: number
  related?: string[]
}

function articleFile(slug: string, options: ArticleOptions = {}): string {
  const { title = `Titre ${slug}`, module = 'absences', permission = 'none', order = 1, related = [] } = options
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

Texte.
`
}

// The same article in both languages, as the repository ships it.
function pair(slug: string, options: ArticleOptions = {}): Record<string, string> {
  return {
    [`content/fr/${slug}.md`]: articleFile(slug, options),
    [`content/en/${slug}.md`]: articleFile(slug, options),
  }
}

describe('assembleHelpArticles: the shape of each file', () => {
  it('orders the articles by language, then by order, then by slug', () => {
    const articles = assembleHelpArticles({ ...pair('a'), ...pair('b', { order: 2 }) })

    expect(articles.map(({ locale, slug }) => `${locale}/${slug}`)).toEqual(['en/a', 'en/b', 'fr/a', 'fr/b'])
  })

  it('refuses a file outside a known language folder', () => {
    expect(() => assembleHelpArticles({ 'content/de/a.md': articleFile('a') })).toThrow('language folder')
  })

  it('refuses a file whose name is not its slug', () => {
    expect(() =>
      assembleHelpArticles({ 'content/fr/other.md': articleFile('a'), 'content/en/a.md': articleFile('a') }),
    ).toThrow('file name')
  })
})

describe('assembleHelpArticles: the invariants across the two languages', () => {
  it('refuses a slug that exists in only one language', () => {
    expect(() => assembleHelpArticles({ 'content/fr/a.md': articleFile('a') })).toThrow('both languages')
  })

  it('refuses a permission that differs between the languages', () => {
    const sources = {
      'content/fr/a.md': articleFile('a', { permission: 'CanViewBoard' }),
      'content/en/a.md': articleFile('a'),
    }

    expect(() => assembleHelpArticles(sources)).toThrow('permission')
  })

  it('refuses a module that differs between the languages', () => {
    const sources = { 'content/fr/a.md': articleFile('a', { module: 'board' }), 'content/en/a.md': articleFile('a') }

    expect(() => assembleHelpArticles(sources)).toThrow('module')
  })

  it('refuses an order that differs between the languages', () => {
    const sources = { 'content/fr/a.md': articleFile('a', { order: 2 }), 'content/en/a.md': articleFile('a') }

    expect(() => assembleHelpArticles(sources)).toThrow('order')
  })

  it('refuses a related set that differs between the languages', () => {
    const sources = {
      ...pair('b'),
      'content/fr/a.md': articleFile('a', { related: ['b'] }),
      'content/en/a.md': articleFile('a'),
    }

    expect(() => assembleHelpArticles(sources)).toThrow('related')
  })

  it('accepts the same related set listed in another order', () => {
    const sources = {
      ...pair('b'),
      ...pair('c'),
      'content/fr/a.md': articleFile('a', { related: ['b', 'c'] }),
      'content/en/a.md': articleFile('a', { related: ['c', 'b'] }),
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

  it('ships the first series in both languages, and only that series', () => {
    for (const locale of ['fr', 'en'] as const) {
      expect(
        ARTICLES.filter(article => article.locale === locale)
          .map(({ slug }) => slug)
          .sort(),
      ).toEqual(SHIPPED_SLUGS)
    }
  })

  it('gives every article a permission that exists, or none', () => {
    const names = new Set(Object.keys(Permission))

    for (const article of ARTICLES) {
      if (article.permission != null) expect(names.has(article.permission)).toBe(true)
    }
  })

  it('keeps the permission of each article tied to its feature', () => {
    const fr = new Map(ARTICLES.filter(article => article.locale === 'fr').map(article => [article.slug, article]))

    expect(fr.get('absences')?.permission).toBeNull()
    expect(fr.get('my-territories')?.permission).toBeNull()
    expect(fr.get('board-read')?.permission).toBe('CanViewBoard')
    expect(fr.get('board-download')?.permission).toBe('CanViewBoard')
    expect(fr.get('board-versions')?.permission).toBe('CanReviewBoardDocuments')
    expect(fr.get('phone-territories')?.permission).toBe('CanConfigureTerritorySettings')
    expect(fr.get('territories-settings')?.permission).toBe('CanConfigureTerritorySettings')
    expect(fr.get('bano')?.permission).toBe('CanConfigureTerritorySettings')
    expect(fr.get('campaign-create')?.permission).toBe('CanManageTerritoryCampaigns')
    expect(fr.get('prospection')?.permission).toBe('CanViewProspection')
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
