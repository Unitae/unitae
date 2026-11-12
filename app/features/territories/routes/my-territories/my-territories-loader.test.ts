import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regression: /me/territories must query attributions by the signed-in
// account's MEMBER id (Attribution.publisherId is a Member FK), not by the
// UserAccount id. The two ids only coincide by accident on small instances,
// so the page silently rendered its empty state everywhere else.

const ACCOUNT_ID = 775
const MEMBER_ID = 1164
const TERRITORY_ID = 33

const currentAccountContext = Symbol('currentAccountContext')
const congregationContext = Symbol('congregationContext')

vi.mock('~/shared/auth/route-context.server', () => ({
  currentAccountContext,
  congregationContext,
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) => fn(fakeDb),
}))

// What each test sets up: the instance's base map, the congregation's map setting, the territory's entrances.
const MAP = { tiles: '/map/tiles/ed/{z}/{x}/{y}', area: { swLat: 45, swLng: 4, neLat: 46, neLng: 5 } }
const stub = {
  hasMap: false,
  mapTabActive: false,
  entrances: [] as unknown[],
}

vi.mock('~/features/territories/server/base-map.server', () => ({
  getBaseMap: async () => (stub.hasMap ? MAP : null),
}))

// One active attribution exists — held by the MEMBER, as in production data.
const attributionRow = {
  id: 1,
  startDate: new Date(2026, 2, 1),
  lateDate: new Date(2026, 11, 1),
  type: 'Default',
  notes: '',
  pausedAt: null,
  territory: { id: TERRITORY_ID, number: 'T01', type: 'doors-to-doors', notes: 'Ask before visiting', entrances: [] },
}

const fakeDb = {
  campaign: { findFirst: vi.fn().mockResolvedValue(null) },
  attribution: {
    findMany: vi.fn(({ where }: { where: { publisherId: number } }) =>
      Promise.resolve(where.publisherId === MEMBER_ID ? [attributionRow] : []),
    ),
    findFirst: vi.fn(({ where }: { where: { publisherId: number; territoryId: number } }) =>
      Promise.resolve(
        where.publisherId === MEMBER_ID && where.territoryId === TERRITORY_ID
          ? { ...attributionRow, territory: { ...attributionRow.territory, entrances: stub.entrances } }
          : null,
      ),
    ),
  },
  setting: {
    findFirst: vi.fn(({ where }: { where: { key: string } }) =>
      Promise.resolve(where.key === 'map-tab-active' && stub.mapTabActive ? { value: 'true' } : null),
    ),
  },
}

const entrance = (id: number, latitude: number | null) => ({
  id,
  homes: 12,
  phones: 0,
  access: null,
  accesses: [],
  isOpenEarly: null,
  isMailboxOpen: null,
  notes: '',
  shopKind: '',
  buildings: [
    { number: String(id), street: 'Rue Voltaire', zip: '69100', latitude, longitude: latitude == null ? null : 4.85 },
  ],
})

beforeEach(() => {
  stub.hasMap = false
  stub.mapTabActive = false
  stub.entrances = []
})

const context = {
  get: (key: unknown) =>
    key === currentAccountContext
      ? { id: ACCOUNT_ID, congregationId: 42, member: { id: MEMBER_ID } }
      : key === congregationContext
        ? { timezone: 'Europe/Paris' }
        : undefined,
}

// Imported once at module scope: a dynamic import inside the test body puts the route's
// transform cost inside the measured window, which made this test time out at random
// under a full parallel run.
const { loader } = await import('./list')
const { loader: viewLoader } = await import('./view')

const loadView = () =>
  viewLoader({
    context,
    params: { territoryId: String(TERRITORY_ID) },
    request: new Request(`http://test/me/territories/${TERRITORY_ID}`),
  } as never)

describe('/me/territories loader', () => {
  it('lists the territories attributed to the signed-in member', async () => {
    const result = await loader({ context, params: {}, request: new Request('http://test/me/territories') } as never)

    expect(result.territories).toHaveLength(1)
    expect(result.territories[0].number).toBe('T01')
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
    // The territory's notes are the managers': they never reach the holder's page.
    expect(result.territory).not.toHaveProperty('notes')
  })

  // Regression: with a base map and the setting on, a territory none of whose buildings is placed
  // got the map anyway: an empty column beside the list, and a « Carte » view with nothing in it.
  it('leaves the map out when none of the entrances is placed on it', async () => {
    stub.hasMap = true
    stub.mapTabActive = true
    stub.entrances = [entrance(3, null), entrance(5, null)]

    const result = await loadView()

    expect(result.streets).toHaveLength(1)
    expect(result.map).toBeNull()
  })

  it('shows the map once one entrance is placed on it', async () => {
    stub.hasMap = true
    stub.mapTabActive = true
    stub.entrances = [entrance(3, null), entrance(5, 45.76)]

    const result = await loadView()

    expect(result.map).toEqual(MAP)
  })

  it('leaves the map out on an instance without a base map', async () => {
    stub.mapTabActive = true
    stub.entrances = [entrance(5, 45.76)]

    expect((await loadView()).map).toBeNull()
  })

  it('leaves the map out when the congregation turned it off', async () => {
    stub.hasMap = true
    stub.entrances = [entrance(5, 45.76)]

    expect((await loadView()).map).toBeNull()
  })
})
