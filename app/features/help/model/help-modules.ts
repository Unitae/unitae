import { HELP_MODULES, type HelpArticle, type HelpModule } from '~/features/help/model/help.type'

export interface HelpModuleGroup {
  module: HelpModule
  articles: HelpArticle[]
}

/** The modules that have at least one of the given articles, in the app's order, each with its articles by order. */
export function groupHelpArticlesByModule(articles: readonly HelpArticle[]): HelpModuleGroup[] {
  return HELP_MODULES.flatMap(module => {
    const inModule = articles
      .filter(article => article.module === module)
      .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
    return inModule.length > 0 ? [{ module, articles: inModule }] : []
  })
}
