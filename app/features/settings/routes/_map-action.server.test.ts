import { beforeEach, describe, expect, it, vi } from 'vitest'

// The congregation map's intents, run against an in-memory record of what each would write: zones count against the
// plan's limit, an update without a new shape keeps the old one, and an imported file adds its zones and replaces the
// perimeter, or writes nothing when it cannot be read.

const { writes, plan } = vi.hoisted(() => ({
  writes: [] as string[],
  plan: { zonesLeft: Number.POSITIVE_INFINITY },
}))

vi.mock('~/features/territories/index.server', () => ({
  createCardOverlay: vi.fn(async (_db: unknown, zone: { name: string | null }) => {
    writes.push(`create ${zone.name}`)
  }),
  updateCardOverlay: vi.fn(async (_db: unknown, id: number, zone: { name: string; paths?: unknown }) => {
    writes.push(`update ${id} ${zone.name}${zone.paths ? ' with shape' : ''}`)
  }),
  deleteCardOverlay: vi.fn(async (_db: unknown, id: number) => {
    writes.push(`delete ${id}`)
  }),
  setPerimeter: vi.fn(async () => {
    writes.push('perimeter')
  }),
  clearPerimeter: vi.fn(async () => {
    writes.push('clear perimeter')
  }),
}))

const { LimitReachedError } = await import('~/shared/errors/app-error.server')
const { cardOverlayActionSchema, handleCardOverlayAction } = await import('./_map-action.server')

const limits = {
  errorIfWouldGoOverLimit: vi.fn(async () => {
    if (plan.zonesLeft <= 0) throw new LimitReachedError('cardOverlays')
    plan.zonesLeft -= 1
  }),
} as never
const db = {} as never

const RING = [
  { lat: 48.85, lng: 2.35 },
  { lat: 48.86, lng: 2.35 },
  { lat: 48.86, lng: 2.36 },
]
const POLYGON = { type: 'Polygon', coordinates: [[...RING.map(p => [p.lng, p.lat]), [RING[0]?.lng, RING[0]?.lat]]] }

function run(fields: Record<string, string>) {
  return handleCardOverlayAction(db, limits, cardOverlayActionSchema.parse(fields), 1, 7)
}

beforeEach(() => {
  writes.length = 0
  plan.zonesLeft = Number.POSITIVE_INFINITY
})

describe('handleCardOverlayAction', () => {
  it('draws a zone within the plan', async () => {
    const result = await run({ intent: 'create', name: ' Nord ', color: '#C2175B', paths: JSON.stringify(RING) })
    expect(result.ok).toBe(true)
    expect(writes).toEqual(['create Nord'])
  })

  it('draws no zone beyond the plan', async () => {
    plan.zonesLeft = 0
    await expect(
      run({ intent: 'create', name: 'Nord', color: '#C2175B', paths: JSON.stringify(RING) }),
    ).rejects.toBeInstanceOf(LimitReachedError)
    expect(writes).toEqual([])
  })

  it('keeps a zone’s shape when only its name or colour changes', async () => {
    await run({ intent: 'update', id: '3', name: 'Sud', color: '#C2175B' })
    await run({ intent: 'update', id: '3', name: 'Sud', color: '#C2175B', paths: JSON.stringify(RING) })
    expect(writes).toEqual(['update 3 Sud', 'update 3 Sud with shape'])
  })

  it('deletes a zone, and sets or clears the perimeter', async () => {
    await run({ intent: 'delete', id: '3' })
    await run({ intent: 'set-perimeter', paths: JSON.stringify(RING) })
    await run({ intent: 'clear-perimeter' })
    expect(writes).toEqual(['delete 3', 'perimeter', 'clear perimeter'])
  })

  it('adds the zones of a file and replaces the perimeter it holds', async () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { role: 'perimeter' }, geometry: POLYGON },
        { type: 'Feature', properties: { name: 'Est', color: '#1E88E5' }, geometry: POLYGON },
      ],
    })
    const result = await run({ intent: 'import-geojson', geojson })
    expect(result.ok).toBe(true)
    expect(writes).toEqual(['perimeter', 'create Est'])
  })

  it('writes nothing from a file it cannot read', async () => {
    const result = await run({ intent: 'import-geojson', geojson: '{ not json' })
    expect(result.ok).toBe(false)
    expect(writes).toEqual([])
  })
})

describe('cardOverlayActionSchema', () => {
  it('refuses a shape of fewer than three points', () => {
    const fields = { intent: 'create', name: 'Nord', color: '#C2175B', paths: JSON.stringify(RING.slice(0, 2)) }
    expect(cardOverlayActionSchema.safeParse(fields).success).toBe(false)
  })
})
