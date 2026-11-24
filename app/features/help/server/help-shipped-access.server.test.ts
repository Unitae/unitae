import { describe, expect, it } from 'vitest'
import type { HelpReader } from '~/features/help/model/help-access'
import { findHelpArticle } from '~/features/help/server/find-help-article.server'
import { loadHelpArticles } from '~/features/help/server/help-content.server'
import { Permission } from '~/shared/types/permission'

/** A reader holding these permissions and leading no group. */
function readerWith(...permissions: Permission[]): HelpReader {
  return { permissions: new Set(permissions), leadsGroup: false, answersForSchedule: false }
}

// The access rules checked against the articles as shipped, not against fixtures.
const ARTICLES = loadHelpArticles()

describe('the shipped help articles, opened by a reader', () => {
  it('refuses the board history to a reader without the board-management right, without its title', () => {
    expect(findHelpArticle(ARTICLES, 'board-versions', 'fr', readerWith(Permission.CanViewBoard))).toEqual({
      kind: 'forbidden',
    })
  })

  it('opens the board history for a member who may upload documents, since they keep the history of their own', () => {
    const result = findHelpArticle(ARTICLES, 'board-versions', 'en', readerWith(Permission.CanUploadBoardDocuments))

    expect(result).toMatchObject({ kind: 'found', article: { slug: 'board-versions' } })
  })

  it('opens the board history for a board manager', () => {
    const result = findHelpArticle(ARTICLES, 'board-versions', 'fr', readerWith(Permission.CanReviewBoardDocuments))

    expect(result).toMatchObject({ kind: 'found', article: { slug: 'board-versions', module: 'board' } })
  })

  it('opens the territory settings article only to a reader who may configure them', () => {
    expect(findHelpArticle(ARTICLES, 'territories-settings', 'fr', readerWith(Permission.CanViewBoard))).toEqual({
      kind: 'forbidden',
    })
    expect(
      findHelpArticle(ARTICLES, 'territories-settings', 'en', readerWith(Permission.CanConfigureTerritorySettings)),
    ).toMatchObject({ kind: 'found', article: { locale: 'en', module: 'settings' } })
  })

  it('lists the history article among the related articles of the download article only for a board manager', () => {
    const reader = findHelpArticle(ARTICLES, 'board-download', 'fr', readerWith(Permission.CanViewBoard))
    const manager = findHelpArticle(
      ARTICLES,
      'board-download',
      'fr',
      readerWith(Permission.CanViewBoard, Permission.CanReviewBoardDocuments),
    )

    expect(reader.kind === 'found' && reader.related.map(({ slug }) => slug)).toEqual(['board-read'])
    expect(manager.kind === 'found' && manager.related.map(({ slug }) => slug)).toEqual([
      'board-read',
      'board-versions',
    ])
  })
})

// A group's overseer and assistant hold no right for it: leading the group opens its reports and emergency roster.
describe('the shipped help articles, opened by a group leader without any permission', () => {
  const leader: HelpReader = { permissions: new Set(), leadsGroup: true, answersForSchedule: false }

  it('opens the reports and the emergency roster', () => {
    for (const slug of ['field-service-reports', 'emergency-roster']) {
      expect(findHelpArticle(ARTICLES, slug, 'fr', leader), slug).toMatchObject({ kind: 'found' })
    }
  })

  it('refuses what only a right opens: the groups, the pioneers, the exports, the arrivals and departures', () => {
    for (const slug of ['groups', 'pioneers', 'activity-exports', 'publisher-arrivals-departures']) {
      expect(findHelpArticle(ARTICLES, slug, 'en', leader), slug).toEqual({ kind: 'forbidden' })
    }
  })
})
