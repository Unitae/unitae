import { describe, expect, it } from 'vitest'
import type { HelpArticle } from '~/features/help/model/help.type'
import {
  canReadHelpArticle,
  type HelpReader,
  visibleHelpArticles,
  visibleHelpSlugs,
} from '~/features/help/model/help-access'
import { Permission } from '~/shared/types/permission'

/** A reader holding these permissions and leading no group. */
function readerWith(...permissions: Permission[]): HelpReader {
  return { permissions: new Set(permissions), leadsGroup: false, answersForSchedule: false }
}

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
    expect(canReadHelpArticle(article('open', null), readerWith())).toBe(true)
  })

  it('lets a reader read an article only when they hold its permission', () => {
    const prospection = article('prospection', ['CanViewProspection'])

    expect(canReadHelpArticle(prospection, readerWith(Permission.CanViewBoard))).toBe(false)
    expect(canReadHelpArticle(prospection, readerWith(Permission.CanViewProspection))).toBe(true)
  })

  it('lets a reader read an article with several permissions when they hold any one of them', () => {
    const versions = article('versions', ['CanReviewBoardDocuments', 'CanUploadBoardDocuments'])

    expect(canReadHelpArticle(versions, readerWith(Permission.CanUploadBoardDocuments))).toBe(true)
    expect(canReadHelpArticle(versions, readerWith(Permission.CanReviewBoardDocuments))).toBe(true)
    expect(canReadHelpArticle(versions, readerWith(Permission.CanViewBoard))).toBe(false)
  })
})

describe('canReadHelpArticle for a feature that leading a group opens', () => {
  const reports = article('group-reports', ['CanRecordActivity', 'GroupLeader'])

  it('lets a group overseer or assistant read it without any permission', () => {
    expect(canReadHelpArticle(reports, { permissions: new Set(), leadsGroup: true, answersForSchedule: false })).toBe(
      true,
    )
  })

  it('lets a reader who holds one of its permissions read it without leading a group', () => {
    expect(canReadHelpArticle(reports, readerWith(Permission.CanRecordActivity))).toBe(true)
  })

  it('refuses it to a reader who neither leads a group nor holds its permissions', () => {
    expect(canReadHelpArticle(reports, readerWith(Permission.CanViewPublishers))).toBe(false)
  })

  it('does not open an article without GroupLeader to a group leader', () => {
    expect(
      canReadHelpArticle(article('board', ['CanViewBoard']), {
        permissions: new Set(),
        leadsGroup: true,
        answersForSchedule: false,
      }),
    ).toBe(false)
  })
})

describe('visibleHelpArticles', () => {
  it('keeps only the articles the reader may see, in their order', () => {
    const visible = visibleHelpArticles(ARTICLES, readerWith(Permission.CanViewBoard))

    expect(visible.map(({ slug }) => slug)).toEqual(['open', 'board'])
  })

  it('shows a reader without any permission only the articles that need none', () => {
    expect(visibleHelpArticles(ARTICLES, readerWith()).map(({ slug }) => slug)).toEqual(['open'])
  })
})

describe('visibleHelpSlugs', () => {
  it('lists the slugs the reader may open, for the « ? » entry points', () => {
    expect(visibleHelpSlugs(ARTICLES, readerWith(Permission.CanViewProspection), 'fr')).toEqual(['open', 'prospection'])
  })
})

describe('visibleHelpSlugs across the two languages', () => {
  const BILINGUAL = [
    { ...article('open', null), locale: 'fr' as const },
    { ...article('open', null), locale: 'en' as const },
    { ...article('board', ['CanViewBoard']), locale: 'fr' as const },
  ]

  it('lists a slug shared by both languages once, for the asked language', () => {
    expect(visibleHelpSlugs(BILINGUAL, readerWith(), 'en')).toEqual(['open'])
  })

  it('follows the asked language for the gated articles too', () => {
    expect(visibleHelpSlugs(BILINGUAL, readerWith(Permission.CanViewBoard), 'fr')).toEqual(['open', 'board'])
    expect(visibleHelpSlugs(BILINGUAL, readerWith(Permission.CanViewBoard), 'en')).toEqual(['open'])
  })

  it('offers the English article where the reader’s language lacks it, so its « ? » still opens', () => {
    const articles = [...BILINGUAL, { ...article('board', ['CanViewBoard']), locale: 'en' as const }]

    expect(visibleHelpSlugs(articles, readerWith(Permission.CanViewBoard), 'pt-PT')).toEqual(['open', 'board'])
  })
})

describe('an article opened to schedule responsibles', () => {
  it('opens to whoever answers for a schedule template, without any right, and to no one else', () => {
    const article = { permission: ['CanManagePrograms', 'ScheduleResponsible'] } as never
    const reader = (answersForSchedule: boolean) => ({
      permissions: new Set<never>(),
      leadsGroup: false,
      answersForSchedule,
    })
    expect(canReadHelpArticle(article, reader(true))).toBe(true)
    expect(canReadHelpArticle(article, reader(false))).toBe(false)
  })
})
