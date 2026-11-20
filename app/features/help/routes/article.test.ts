import { describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'

// The article loader, as the page and the side panel both read it.
const permissionsContext = Symbol('permissionsContext')
const currentAccountContext = Symbol('currentAccountContext')
const congregationContext = Symbol('congregationContext')
vi.mock('~/shared/auth/route-context.server', () => ({
  permissionsContext,
  currentAccountContext,
  congregationContext,
}))

// An account whose record leads no group.
const ACCOUNT = { member: null }

vi.mock('~/i18n/paraglide/runtime', async importOriginal => ({
  ...(await importOriginal<typeof import('~/i18n/paraglide/runtime')>()),
  getLocale: () => 'fr',
}))

const { loader } = await import('./article')

function run(slug: string, permissions: ReadonlySet<Permission>, demoExpiresAt: Date | null = null) {
  const values = new Map<symbol, unknown>([
    [permissionsContext, permissions],
    [currentAccountContext, ACCOUNT],
    [congregationContext, { demoExpiresAt }],
  ])
  const context = { get: (key: symbol) => values.get(key) }
  return loader({ params: { slug }, context } as never)
}

describe('the article loader', () => {
  it('answers forbidden, with exactly its slug and nothing else, for a reader without the right', async () => {
    const view = await run('board-versions', new Set([Permission.CanViewBoard]))

    expect(view).toStrictEqual({ kind: 'forbidden', slug: 'board-versions' })
  })

  it('answers missing, with exactly its slug, for an unknown article', async () => {
    const view = await run('nope', new Set())

    expect(view).toStrictEqual({ kind: 'missing', slug: 'nope' })
  })

  it('opens the article for a board manager', async () => {
    const view = await run('board-versions', new Set([Permission.CanReviewBoardDocuments]))

    expect(view).toMatchObject({ kind: 'found', slug: 'board-versions', module: 'board' })
    expect(view).not.toHaveProperty('demoLimit')
  })

  it('says in a demo copy what the copy refuses of the task', async () => {
    vi.stubEnv('UNITAE_DEMO', 'true')
    try {
      const view = await run('board-versions', new Set([Permission.CanReviewBoardDocuments]), new Date())

      expect(view).toMatchObject({ kind: 'found', demoLimit: 'no-upload' })
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
