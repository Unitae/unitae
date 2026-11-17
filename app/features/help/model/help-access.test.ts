import { describe, expect, it } from 'vitest'
import type { HelpArticle } from '~/features/help/model/help.type'
import { canReadHelpArticle, visibleHelpArticles, visibleHelpSlugs } from '~/features/help/model/help-access'
import { Permission } from '~/shared/types/permission'

function article(slug: string, permission: HelpArticle['permission']): HelpArticle {
  return {
    slug,
    locale: 'fr',
    title: slug,
    summary: '',
    module: 'absences',
    permission,
    keywords: [],
    related: [],
    order: 1,
    body: '',
  }
}

const ARTICLES = [
  article('open', null),
  article('prospection', ['CanViewProspection']),
  article('board', ['CanViewBoard']),
]

describe('canReadHelpArticle', () => {
  it('lets anyone read an article that needs no permission', () => {
    expect(canReadHelpArticle(article('open', null), new Set())).toBe(true)
  })

  it('lets a reader read an article only when they hold its permission', () => {
    const prospection = article('prospection', ['CanViewProspection'])

    expect(canReadHelpArticle(prospection, new Set([Permission.CanViewBoard]))).toBe(false)
    expect(canReadHelpArticle(prospection, new Set([Permission.CanViewProspection]))).toBe(true)
  })

  it('lets a reader read an article with several permissions when they hold any one of them', () => {
    const versions = article('versions', ['CanReviewBoardDocuments', 'CanUploadBoardDocuments'])

    expect(canReadHelpArticle(versions, new Set([Permission.CanUploadBoardDocuments]))).toBe(true)
    expect(canReadHelpArticle(versions, new Set([Permission.CanReviewBoardDocuments]))).toBe(true)
    expect(canReadHelpArticle(versions, new Set([Permission.CanViewBoard]))).toBe(false)
  })
})

describe('visibleHelpArticles', () => {
  it('keeps only the articles the reader may see, in their order', () => {
    const visible = visibleHelpArticles(ARTICLES, new Set([Permission.CanViewBoard]))

    expect(visible.map(({ slug }) => slug)).toEqual(['open', 'board'])
  })

  it('shows a reader without any permission only the articles that need none', () => {
    expect(visibleHelpArticles(ARTICLES, new Set()).map(({ slug }) => slug)).toEqual(['open'])
  })
})

describe('visibleHelpSlugs', () => {
  it('lists the slugs the reader may open, for the « ? » entry points', () => {
    expect(visibleHelpSlugs(ARTICLES, new Set([Permission.CanViewProspection]), 'fr')).toEqual(['open', 'prospection'])
  })
})

describe('visibleHelpSlugs across the two languages', () => {
  const BILINGUAL = [
    { ...article('open', null), locale: 'fr' as const },
    { ...article('open', null), locale: 'en' as const },
    { ...article('board', ['CanViewBoard']), locale: 'fr' as const },
  ]

  it('lists a slug shared by both languages once, for the asked language', () => {
    expect(visibleHelpSlugs(BILINGUAL, new Set(), 'en')).toEqual(['open'])
  })

  it('follows the asked language for the gated articles too', () => {
    expect(visibleHelpSlugs(BILINGUAL, new Set([Permission.CanViewBoard]), 'fr')).toEqual(['open', 'board'])
    expect(visibleHelpSlugs(BILINGUAL, new Set([Permission.CanViewBoard]), 'en')).toEqual(['open'])
  })
})
