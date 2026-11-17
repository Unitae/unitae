import type { HelpArticle } from '~/features/help/model/help.type'

const DIACRITICS = /\p{Diacritic}/gu
const WHITESPACE = /\s+/

/** Lower case, accents removed, so « créer » and « CREER » and « creer » are the same word. */
export function normaliseHelpText(text: string): string {
  return text.normalize('NFD').replace(DIACRITICS, '').toLowerCase()
}

/**
 * The articles whose title, summary, keywords or body contain every word of the query, in the order given. Each word
 * matches as a substring, accents and case aside, of the body as written in the file, Markdown included: « crée »
 * finds « créer », and a word inside a link's address matches too.
 */
export function searchHelpArticles(articles: readonly HelpArticle[], query: string): HelpArticle[] {
  const words = normaliseHelpText(query)
    .split(WHITESPACE)
    .filter(word => word !== '')
  if (words.length === 0) return []

  return articles.filter(article => {
    const haystack = normaliseHelpText(
      [article.title, article.summary, article.keywords.join(' '), article.body].join(' '),
    )
    return words.every(word => haystack.includes(word))
  })
}
