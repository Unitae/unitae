import { describe, expect, it } from 'vitest'
import { HelpArticleFormatError, parseHelpArticle } from '~/features/help/model/parse-help-article'

const TITLE_LINE = /title:.*\n/
const MISSING_TITLE = /title/

const VALID = `---
slug: absences
title: Comment indiquer mes absences ?
summary: Une période, et ce qu’elle touche dans les programmes.
module: absences
permission: none
keywords: absence, programme
related: my-territories, board-read
order: 1
---

## Étapes

1. Ouvrez « Mes absences ».
`

describe('parseHelpArticle', () => {
  it('reads the frontmatter and keeps the Markdown body apart', () => {
    const article = parseHelpArticle(VALID, 'fr')

    expect(article).toEqual({
      slug: 'absences',
      locale: 'fr',
      title: 'Comment indiquer mes absences ?',
      summary: 'Une période, et ce qu’elle touche dans les programmes.',
      module: 'absences',
      permission: null,
      keywords: ['absence', 'programme'],
      related: ['my-territories', 'board-read'],
      order: 1,
      body: '## Étapes\n\n1. Ouvrez « Mes absences ».',
    })
  })

  it('reads a permission by the name of its enum member', () => {
    const article = parseHelpArticle(VALID.replace('permission: none', 'permission: CanViewProspection'), 'en')

    expect(article.permission).toBe('CanViewProspection')
    expect(article.locale).toBe('en')
  })

  it('accepts empty keyword and related lists', () => {
    const source = VALID.replace('keywords: absence, programme', 'keywords:').replace(
      'related: my-territories, board-read',
      'related:',
    )
    const article = parseHelpArticle(source, 'fr')

    expect(article.keywords).toEqual([])
    expect(article.related).toEqual([])
  })

  it('keeps colons inside values, splitting only at the first one', () => {
    const source = VALID.replace(
      'summary: Une période, et ce qu’elle touche dans les programmes.',
      'summary: Ce qu’il faut : rien d’autre.',
    )

    expect(parseHelpArticle(source, 'fr').summary).toBe('Ce qu’il faut : rien d’autre.')
  })

  it('refuses a file without a frontmatter block', () => {
    expect(() => parseHelpArticle('## Pas de métadonnées\n', 'fr')).toThrow(HelpArticleFormatError)
  })

  it('refuses a module outside the known list', () => {
    expect(() => parseHelpArticle(VALID.replace('module: absences', 'module: inconnu'), 'fr')).toThrow(
      HelpArticleFormatError,
    )
  })

  it('refuses a permission that is neither none nor a Permission member', () => {
    expect(() => parseHelpArticle(VALID.replace('permission: none', 'permission: CanFly'), 'fr')).toThrow(
      HelpArticleFormatError,
    )
  })

  it('refuses a missing required key, naming it', () => {
    expect(() => parseHelpArticle(VALID.replace(TITLE_LINE, ''), 'fr')).toThrow(MISSING_TITLE)
  })

  it('refuses a slug that is not lowercase words joined by dashes', () => {
    expect(() => parseHelpArticle(VALID.replace('slug: absences', 'slug: Mes Absences'), 'fr')).toThrow(
      HelpArticleFormatError,
    )
  })

  it('refuses an order that is not a whole number', () => {
    expect(() => parseHelpArticle(VALID.replace('order: 1', 'order: premier'), 'fr')).toThrow(HelpArticleFormatError)
  })
})
