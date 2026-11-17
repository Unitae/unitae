import { describe, expect, it } from 'vitest'
import { assembleHelpArticles, loadHelpArticles } from '~/features/help/server/help-content.server'
import { Permission } from '~/shared/types/permission'

const ARTICLES = loadHelpArticles()
const HTML_TAG = /<\/?[a-z][^>]*>/i
const UNKNOWN_LANGUAGE = /language folder/
const DUPLICATE_SLUG = /share the slug/
const SLUGS = [
  'absences',
  'board-read',
  'board-download',
  'phone-territories',
  'create-territory',
  'my-territories',
  'campaign-create',
  'prospection',
  'bano',
  'territories-settings',
  'board-versions',
]

const FILE = (slug: string, order = 1) => `---
slug: ${slug}
title: Titre ${slug}
summary: Résumé.
module: absences
permission: none
keywords:
related:
order: ${order}
---

Texte.
`

describe('assembleHelpArticles', () => {
  it('reads the language from the folder and orders the articles by language, then order', () => {
    const articles = assembleHelpArticles({
      'content/fr/b.md': FILE('b', 2),
      'content/en/a.md': FILE('a'),
      'content/fr/a.md': FILE('a'),
    })

    expect(articles.map(({ locale, slug }) => `${locale}/${slug}`)).toEqual(['en/a', 'fr/a', 'fr/b'])
  })

  it('refuses a file outside a known language folder', () => {
    expect(() => assembleHelpArticles({ 'content/de/a.md': FILE('a') })).toThrow(UNKNOWN_LANGUAGE)
  })

  it('refuses two articles with the same slug in one language', () => {
    expect(() => assembleHelpArticles({ 'content/fr/a.md': FILE('a'), 'content/fr/other.md': FILE('a') })).toThrow(
      DUPLICATE_SLUG,
    )
  })
})

describe('loadHelpArticles', () => {
  it('ships every article of the first series in both languages', () => {
    for (const locale of ['fr', 'en'] as const) {
      expect(
        ARTICLES.filter(article => article.locale === locale)
          .map(({ slug }) => slug)
          .sort(),
      ).toEqual([...SLUGS].sort())
    }
  })

  it('gives every article a permission that exists, or none', () => {
    const names = new Set(Object.keys(Permission))

    for (const article of ARTICLES) {
      if (article.permission != null) expect(names.has(article.permission)).toBe(true)
    }
  })

  it('points related articles only at articles of the same language', () => {
    for (const article of ARTICLES) {
      for (const related of article.related) {
        expect(ARTICLES.some(other => other.locale === article.locale && other.slug === related)).toBe(true)
      }
    }
  })

  it('keeps the permission of each article tied to its feature', () => {
    const fr = new Map(ARTICLES.filter(article => article.locale === 'fr').map(article => [article.slug, article]))

    expect(fr.get('absences')?.permission).toBeNull()
    expect(fr.get('my-territories')?.permission).toBeNull()
    expect(fr.get('board-read')?.permission).toBe('CanViewBoard')
    expect(fr.get('phone-territories')?.permission).toBe('CanConfigureTerritorySettings')
    expect(fr.get('bano')?.permission).toBe('CanConfigureTerritorySettings')
    expect(fr.get('territories-settings')?.permission).toBe('CanConfigureTerritorySettings')
    expect(fr.get('board-versions')?.permission).toBe('CanReviewBoardDocuments')
    expect(fr.get('campaign-create')?.permission).toBe('CanManageTerritoryCampaigns')
    expect(fr.get('prospection')?.permission).toBe('CanViewProspection')
  })

  it('writes no raw HTML in an article body', () => {
    for (const article of ARTICLES) {
      expect(article.body).not.toMatch(HTML_TAG)
    }
  })
})
