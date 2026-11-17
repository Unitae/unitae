import { describe, expect, it } from 'vitest'
import type { HelpArticle } from '~/features/help/model/help.type'
import { findHelpArticle } from '~/features/help/server/find-help-article.server'
import { Permission } from '~/shared/types/permission'

function article(overrides: Partial<HelpArticle> & Pick<HelpArticle, 'slug'>): HelpArticle {
  return {
    locale: 'fr',
    title: `Titre ${overrides.slug}`,
    summary: '',
    module: 'territories',
    permission: null,
    keywords: [],
    related: [],
    order: 1,
    body: '',
    ...overrides,
  }
}

const ARTICLES = [
  article({ slug: 'open', related: ['phone', 'absent-slug'] }),
  article({ slug: 'phone', permission: ['CanConfigureTerritorySettings'], related: ['open'] }),
  article({ slug: 'prospection', permission: ['CanViewProspection'] }),
  article({ slug: 'prospection', locale: 'en', permission: ['CanViewProspection'] }),
]

describe('findHelpArticle', () => {
  it('returns an article the reader may open, with its related articles they may open too', () => {
    const result = findHelpArticle(ARTICLES, 'open', 'fr', new Set([Permission.CanConfigureTerritorySettings]))

    expect(result.kind).toBe('found')
    if (result.kind !== 'found') return
    expect(result.article.slug).toBe('open')
    expect(result.related.map(({ slug }) => slug)).toEqual(['phone'])
  })

  it('leaves out related articles the reader may not open, and the ones that do not exist', () => {
    const result = findHelpArticle(ARTICLES, 'open', 'fr', new Set())

    expect(result.kind === 'found' && result.related).toEqual([])
  })

  it('refuses an article whose permission the reader does not hold, without revealing it', () => {
    expect(findHelpArticle(ARTICLES, 'phone', 'fr', new Set([Permission.CanViewBoard]))).toEqual({ kind: 'forbidden' })
  })

  it('reports an unknown slug as missing', () => {
    expect(findHelpArticle(ARTICLES, 'nope', 'fr', new Set())).toEqual({ kind: 'missing' })
  })

  it('looks only in the asked language', () => {
    const granted = new Set([Permission.CanViewProspection])

    expect(findHelpArticle(ARTICLES, 'prospection', 'en', granted)).toMatchObject({
      kind: 'found',
      article: { locale: 'en' },
    })
    expect(findHelpArticle(ARTICLES.slice(0, 2), 'open', 'en', new Set())).toEqual({ kind: 'missing' })
  })
})
