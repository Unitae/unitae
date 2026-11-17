import { describe, expect, it } from 'vitest'
import { findHelpArticle } from '~/features/help/server/find-help-article.server'
import { loadHelpArticles } from '~/features/help/server/help-content.server'
import { Permission } from '~/shared/types/permission'

// The access rules checked against the articles as shipped, not against fixtures.
const ARTICLES = loadHelpArticles()

describe('the shipped help articles, opened by a reader', () => {
  it('refuses the board history to a reader without the board-management right, without its title', () => {
    expect(findHelpArticle(ARTICLES, 'board-versions', 'fr', new Set([Permission.CanViewBoard]))).toEqual({
      kind: 'forbidden',
    })
  })

  it('opens the board history for a member who may upload documents, since they keep the history of their own', () => {
    const result = findHelpArticle(ARTICLES, 'board-versions', 'en', new Set([Permission.CanUploadBoardDocuments]))

    expect(result).toMatchObject({ kind: 'found', article: { slug: 'board-versions' } })
  })

  it('opens the board history for a board manager', () => {
    const result = findHelpArticle(ARTICLES, 'board-versions', 'fr', new Set([Permission.CanReviewBoardDocuments]))

    expect(result).toMatchObject({ kind: 'found', article: { slug: 'board-versions', module: 'board' } })
  })

  it('opens the territory settings article only to a reader who may configure them', () => {
    expect(findHelpArticle(ARTICLES, 'territories-settings', 'fr', new Set([Permission.CanViewBoard]))).toEqual({
      kind: 'forbidden',
    })
    expect(
      findHelpArticle(ARTICLES, 'territories-settings', 'en', new Set([Permission.CanConfigureTerritorySettings])),
    ).toMatchObject({ kind: 'found', article: { locale: 'en', module: 'settings' } })
  })

  it('lists the history article among the related articles of the download article only for a board manager', () => {
    const reader = findHelpArticle(ARTICLES, 'board-download', 'fr', new Set([Permission.CanViewBoard]))
    const manager = findHelpArticle(
      ARTICLES,
      'board-download',
      'fr',
      new Set([Permission.CanViewBoard, Permission.CanReviewBoardDocuments]),
    )

    expect(reader.kind === 'found' && reader.related.map(({ slug }) => slug)).toEqual(['board-read'])
    expect(manager.kind === 'found' && manager.related.map(({ slug }) => slug)).toEqual([
      'board-read',
      'board-versions',
    ])
  })
})
