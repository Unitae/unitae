import { describe, expect, it } from 'vitest'
import type { HelpArticle } from '~/features/help/model/help.type'
import { searchHelpArticles } from '~/features/help/model/search-help-articles'

function article(overrides: Partial<HelpArticle> & Pick<HelpArticle, 'slug'>): HelpArticle {
  return {
    locale: 'fr',
    title: 'Titre',
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
  article({
    slug: 'create',
    title: 'Comment créer un territoire ?',
    body: 'Choisissez le type, puis « Créer le territoire ».',
  }),
  article({
    slug: 'phone',
    title: 'Comment activer les territoires de type « téléphone » ?',
    keywords: ['téléphone', 'appel'],
    body: 'Le type est désactivé par défaut.',
  }),
  article({
    slug: 'bano',
    title: 'Comment régler la source des adresses (BANO) ?',
    body: 'Collez le fichier CSV du département.',
  }),
]

describe('searchHelpArticles', () => {
  it('finds an article by a word of its body, not only its title', () => {
    expect(searchHelpArticles(ARTICLES, 'csv').map(({ slug }) => slug)).toEqual(['bano'])
  })

  it('ignores case and accents', () => {
    expect(searchHelpArticles(ARTICLES, 'CREER').map(({ slug }) => slug)).toEqual(['create'])
    expect(searchHelpArticles(ARTICLES, 'telephone').map(({ slug }) => slug)).toEqual(['phone'])
  })

  it('finds a word listed in the keywords', () => {
    expect(searchHelpArticles(ARTICLES, 'appel').map(({ slug }) => slug)).toEqual(['phone'])
  })

  it('requires every word of the query to match', () => {
    expect(searchHelpArticles(ARTICLES, 'territoire créer').map(({ slug }) => slug)).toEqual(['create'])
    expect(searchHelpArticles(ARTICLES, 'csv territoire')).toEqual([])
  })

  it('returns nothing for a blank query or one with no match', () => {
    expect(searchHelpArticles(ARTICLES, '   ')).toEqual([])
    expect(searchHelpArticles(ARTICLES, 'hélicoptère')).toEqual([])
  })
})
