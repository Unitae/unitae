import { describe, expect, it } from 'vitest'
import type { HelpArticle } from '~/features/help/model/help.type'
import { helpArticleView } from '~/features/help/server/help-article-view.server'
import { Permission } from '~/shared/types/permission'

const ARTICLES: HelpArticle[] = [
  {
    slug: 'prospection',
    locale: 'fr',
    title: 'Comment fonctionne la prospection ?',
    summary: 'Bâtiments et adresses.',
    module: 'prospection',
    permission: 'CanViewProspection',
    keywords: [],
    related: ['bano'],
    order: 1,
    body: '## Étapes\n\n<b>brut</b> et **gras**',
  },
  {
    slug: 'bano',
    locale: 'fr',
    title: 'Source des adresses ?',
    summary: 'Réglages.',
    module: 'settings',
    permission: 'CanConfigureTerritorySettings',
    keywords: [],
    related: [],
    order: 1,
    body: 'Collez le fichier.',
  },
]

describe('helpArticleView', () => {
  it('draws an article the reader may open, its body rendered and its related articles they may open', () => {
    const view = helpArticleView(ARTICLES, 'prospection', 'fr', new Set([Permission.CanViewProspection]))

    expect(view).toEqual({
      kind: 'found',
      slug: 'prospection',
      title: 'Comment fonctionne la prospection ?',
      summary: 'Bâtiments et adresses.',
      module: 'prospection',
      html: expect.stringContaining('<strong>gras</strong>'),
      related: [],
    })
  })

  it('escapes raw HTML in the body', () => {
    const view = helpArticleView(ARTICLES, 'prospection', 'fr', new Set([Permission.CanViewProspection]))

    expect(view.kind === 'found' && view.html).not.toContain('<b>brut</b>')
  })

  it('refuses an article the reader may not open, with no title in the answer', () => {
    expect(helpArticleView(ARTICLES, 'prospection', 'fr', new Set())).toStrictEqual({
      kind: 'forbidden',
      slug: 'prospection',
    })
  })

  it('answers missing for an unknown slug', () => {
    expect(helpArticleView(ARTICLES, 'inconnu', 'fr', new Set())).toStrictEqual({
      kind: 'missing',
      slug: 'inconnu',
    })
  })
})
