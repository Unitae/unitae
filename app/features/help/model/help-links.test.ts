import { describe, expect, it } from 'vitest'
import type { HelpArticle, HelpLocale } from '~/features/help/model/help.type'
import { helpArticlesIn, helpLocaleFor } from '~/features/help/model/help-links'

// Like the messages: a language without its own articles reads the English ones, the fallback locale.
describe('helpLocaleFor', () => {
  it('reads the articles in the language of the app when the folder exists', () => {
    expect(helpLocaleFor('fr')).toBe('fr')
    expect(helpLocaleFor('en')).toBe('en')
    expect(helpLocaleFor('pt-PT')).toBe('pt-PT')
  })

  it('falls back to English for a language with no articles, as messages fall back to en.json', () => {
    expect(helpLocaleFor('de')).toBe('en')
    expect(helpLocaleFor('')).toBe('en')
  })
})

function article(slug: string, locale: HelpLocale): HelpArticle {
  return {
    slug,
    locale,
    title: `${locale} ${slug}`,
    summary: '',
    module: 'absences',
    permission: null,
    keywords: [],
    related: [],
    order: 1,
    body: '',
  }
}

// Article by article, like the messages key by key: what a language lacks is read in English.
describe('helpArticlesIn', () => {
  const ARTICLES = [
    article('absences', 'fr'),
    article('absences', 'en'),
    article('absences', 'pt-PT'),
    article('groups', 'fr'),
    article('groups', 'en'),
  ]

  it('gives the articles of the language, and the English one for each it lacks', () => {
    expect(helpArticlesIn(ARTICLES, 'pt-PT').map(({ locale, slug }) => `${locale}/${slug}`)).toEqual([
      'pt-PT/absences',
      'en/groups',
    ])
  })

  it('gives only the language’s own articles when it lacks none', () => {
    expect(helpArticlesIn(ARTICLES, 'fr').map(({ locale, slug }) => `${locale}/${slug}`)).toEqual([
      'fr/absences',
      'fr/groups',
    ])
  })
})
