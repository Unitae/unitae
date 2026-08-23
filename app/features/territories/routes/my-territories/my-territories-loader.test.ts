import { describe, expect, it, vi } from 'vitest'

// Regression: /me/territories must query attributions by the signed-in
// account's MEMBER id (Attribution.publisherId is a Member FK), not by the
// UserAccount id. The two ids only coincide by accident on small instances,
// so the page silently rendered its empty state everywhere else.

const ACCOUNT_ID = 775
const MEMBER_ID = 1164
const TERRITORY_ID = 33

const currentAccountContext = Symbol('currentAccountContext')

vi.mock('~/shared/auth/route-context.server', () => ({
  currentAccountContext,
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) => fn(fakeDb),
}))

vi.mock('~/shared/utils/env.server', () => ({
  getOptionalEnv: () => undefined,
}))

// One active attribution exists — held by the MEMBER, as in production data.
const attributionRow = {
  id: 1,
  startDate: new Date(2026, 2, 1),
  lateDate: new Date(2026, 11, 1),
  type: 'Default',
  notes: '',
  territory: { id: TERRITORY_ID, number: 'T01', type: 'doors-to-doors', entrances: [] },
}

const fakeDb = {
  campaign: { findFirst: vi.fn().mockResolvedValue(null) },
  attribution: {
    findMany: vi.fn(({ where }: { where: { publisherId: number } }) =>
      Promise.resolve(where.publisherId === MEMBER_ID ? [attributionRow] : []),
    ),
    findFirst: vi.fn(({ where }: { where: { publisherId: number; territoryId: number } }) =>
      Promise.resolve(where.publisherId === MEMBER_ID && where.territoryId === TERRITORY_ID ? attributionRow : null),
    ),
  },
  setting: { findFirst: vi.fn().mockResolvedValue(null) },
}

const context = {
  get: (key: unknown) =>
    key === currentAccountContext ? { id: ACCOUNT_ID, congregationId: 42, member: { id: MEMBER_ID } } : undefined,
}

describe('/me/territories loader', () => {
  it('lists the territories attributed to the signed-in member', async () => {
    const { loader } = await import('./list')

    const result = await loader({ context, params: {}, request: new Request('http://test/me/territories') } as never)

    expect(result.territories).toHaveLength(1)
    expect(result.territories[0].territory.number).toBe('T01')
  })
})

describe('/me/territories/:territoryId loader', () => {
  it('resolves the territory detail through the member id instead of redirecting', async () => {
    const { loader } = await import('./view')

    const result = await loader({
      context,
      params: { territoryId: String(TERRITORY_ID) },
      request: new Request(`http://test/me/territories/${TERRITORY_ID}`),
    } as never)

    expect(result.territory.number).toBe('T01')
  })
})
