import { describe, expect, it, vi } from 'vitest'
import type { HelpArticle } from '~/features/help/model/help.type'
import type { HelpReader } from '~/features/help/model/help-access'
import { HelpArticleFormatError } from '~/features/help/model/parse-help-article'
import { helpSlugsFor } from '~/features/help/server/help-slugs.server'
import { Permission } from '~/shared/types/permission'

/** A reader holding these permissions and leading no group. */
function readerWith(...permissions: Permission[]): HelpReader {
  return { permissions: new Set(permissions), leadsGroup: false, answersForSchedule: false }
}

function article(
  locale: HelpArticle['locale'],
  slug: string,
  permission: HelpArticle['permission'] = null,
): HelpArticle {
  return {
    slug,
    locale,
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
  article('fr', 'open'),
  article('en', 'open'),
  article('fr', 'bano', ['CanConfigureTerritorySettings']),
  article('en', 'bano', ['CanConfigureTerritorySettings']),
  article('en', 'only-english'),
]

describe('helpSlugsFor', () => {
  it('lists the slugs the reader may open in their language, each once', () => {
    expect(helpSlugsFor(readerWith(), 'fr', () => ARTICLES)).toEqual(['open'])
    expect(helpSlugsFor(readerWith(Permission.CanConfigureTerritorySettings), 'fr', () => ARTICLES)).toEqual([
      'open',
      'bano',
    ])
    expect(helpSlugsFor(readerWith(), 'en', () => ARTICLES)).toEqual(['open', 'only-english'])
  })

  it('gives no slugs and reports the error when the articles are malformed, so the layout keeps working', () => {
    const report = vi.fn()
    const broken = (): HelpArticle[] => {
      throw new HelpArticleFormatError('Help article « x » has no frontmatter block.')
    }

    expect(helpSlugsFor(readerWith(), 'fr', broken, report)).toEqual([])
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('frontmatter') }))
  })

  it('lets any other failure through, rather than hiding it', () => {
    const unexpected = (): HelpArticle[] => {
      throw new TypeError('not a help problem')
    }

    expect(() => helpSlugsFor(readerWith(), 'fr', unexpected, vi.fn())).toThrow(TypeError)
  })
})
