import { describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'

// The index of /aide, run as the loader runs it: only the articles the reader may see, in the reader's language.
const permissionsContext = Symbol('permissionsContext')
vi.mock('~/shared/auth/route-context.server', () => ({ permissionsContext }))

let currentLocale = 'fr'
vi.mock('~/i18n/paraglide/runtime', async importOriginal => ({
  ...(await importOriginal<typeof import('~/i18n/paraglide/runtime')>()),
  getLocale: () => currentLocale,
}))

const { loader } = await import('./index')

function run(search: string, permissions: ReadonlySet<Permission>) {
  const context = { get: (key: symbol) => (key === permissionsContext ? permissions : undefined) }
  return loader({ request: new Request(`http://localhost/aide${search}`), context } as never)
}

function groupedSlugs(groups: { articles: { slug: string }[] }[]) {
  return groups.flatMap(group => group.articles.map(({ slug }) => slug))
}

describe('the /aide index loader', () => {
  it('lists and searches no gated article for a reader without permissions', async () => {
    currentLocale = 'fr'
    const result = await run('?q=bano', new Set())

    expect(result.results).toEqual([])
    expect(groupedSlugs(result.groups)).toEqual(['absences', 'my-territories'])
  })

  it('finds a gated article once the reader holds its permission', async () => {
    currentLocale = 'fr'
    const result = await run('?q=bano', new Set([Permission.CanConfigureTerritorySettings]))

    expect(result.results.map(({ slug }) => slug)).toContain('bano')
  })

  it('lists only the articles of the reader’s language', async () => {
    currentLocale = 'en'
    const result = await run('?q=bano', new Set([Permission.CanConfigureTerritorySettings]))

    expect(result.results.find(({ slug }) => slug === 'bano')?.title).toBe('How do I set the address source (BANO)?')
    expect(groupedSlugs(result.groups).length).toBeGreaterThan(0)
    for (const group of result.groups) {
      for (const article of group.articles) {
        expect(article.title.startsWith('Comment ')).toBe(false)
      }
    }
  })
})
