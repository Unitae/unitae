import { describe, expect, it } from 'vitest'
import type { HelpArticle } from '~/features/help/model/help.type'
import { groupHelpArticlesByModule } from '~/features/help/model/help-modules'

function article(slug: string, module: HelpArticle['module'], order: number): HelpArticle {
  return {
    slug,
    locale: 'fr',
    title: slug,
    summary: '',
    module,
    permission: null,
    keywords: [],
    related: [],
    order,
    body: '',
  }
}

describe('groupHelpArticlesByModule', () => {
  it('groups articles under their module, modules in the sidebar order and articles by order', () => {
    const groups = groupHelpArticlesByModule([
      article('campaign', 'campaigns', 1),
      article('territory-b', 'territories', 2),
      article('absences', 'absences', 1),
      article('territory-a', 'territories', 1),
      article('mine', 'my-territories', 1),
    ])

    expect(groups.map(({ module, articles }) => [module, articles.map(({ slug }) => slug)])).toEqual([
      ['my-territories', ['mine']],
      ['absences', ['absences']],
      ['campaigns', ['campaign']],
      ['territories', ['territory-a', 'territory-b']],
    ])
  })

  it('leaves out a module without any article', () => {
    expect(groupHelpArticlesByModule([])).toEqual([])
  })
})
