import type { Permission } from '~/shared/types/permission'

export const HELP_LOCALES = ['fr', 'en'] as const
export type HelpLocale = (typeof HELP_LOCALES)[number]

/** The articles a reader gets when their language has no folder of its own, as messages fall back to en.json. */
export const HELP_FALLBACK_LOCALE: HelpLocale = 'en'

/**
 * The areas of the app the articles are grouped under, in the order the sidebar lists them. Each one is named by
 * the sidebar's own label, so the help speaks the same words as the page it is about.
 */
export const HELP_MODULES = [
  'my-territories',
  'absences',
  'board',
  'campaigns',
  'territories',
  'prospection',
  'settings',
] as const
export type HelpModule = (typeof HELP_MODULES)[number]

export interface HelpArticle {
  slug: string
  locale: HelpLocale
  title: string
  /** One line for the home page and the search results. */
  summary: string
  module: HelpModule
  /** The permissions of the feature, any one of which opens the article. `null` when anyone may read it. */
  permission: readonly (keyof typeof Permission)[] | null
  keywords: string[]
  related: string[]
  order: number
  /** The Markdown body, as written in the file. Rendered on the server only. */
  body: string
}

/**
 * What an article page or the side panel draws. Every variant names the slug it answers for, so a panel never shows
 * an answer for another article. A forbidden or missing article carries no title and no body.
 */
export type HelpArticleView =
  | {
      kind: 'found'
      slug: string
      title: string
      summary: string
      module: HelpModule
      html: string
      related: { slug: string; title: string }[]
    }
  | { kind: 'forbidden'; slug: string }
  | { kind: 'missing'; slug: string }
  /** The article could not be read on the server. Shown inside the panel or the page, never in place of the app. */
  | { kind: 'error'; slug: string }
