import type { HelpArticle, HelpLocale } from '~/features/help/model/help.type'
import { type HelpReader, visibleHelpSlugs } from '~/features/help/model/help-access'
import { HelpArticleFormatError } from '~/features/help/model/parse-help-article'
import { loadHelpArticles } from '~/features/help/server/help-content.server'
import { logger } from '~/shared/infra/logger.server'

function reportHelpError(error: HelpArticleFormatError): void {
  logger.error(`In-app help gives no « ? » entry points: ${error.message}`)
}

/**
 * The slugs this reader may open in their language, for the « ? » entry points on each page. When the articles are
 * malformed, the layout still works: it gets no slugs and the error is reported. Any other failure is not hidden.
 */
export function helpSlugsFor(
  reader: HelpReader,
  locale: HelpLocale,
  articles: () => readonly HelpArticle[] = loadHelpArticles,
  report: (error: HelpArticleFormatError) => void = reportHelpError,
): string[] {
  try {
    return visibleHelpSlugs(articles(), reader, locale)
  } catch (error) {
    if (error instanceof HelpArticleFormatError) {
      report(error)
      return []
    }
    throw error
  }
}
