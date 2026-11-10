import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const audited: unknown[] = []
vi.mock('~/shared/domain/audit.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/domain/audit.server')>()),
  audit: (entry: unknown) => {
    audited.push(entry)
  },
}))

const { deactivateBuildings } = await import('./deactivate-buildings.server')
const { unscopedDb, withScope } = await import('~/shared/infra/db.server')

const ts = Date.now()
let congregationId: number
let otherCongregationId: number

function create(congregation: number, number: string, active = true) {
  return withScope(congregation, db =>
    db.building.create({
      data: { number, street: 'Rue des Manquants', zip: '93260', active, congregationId: congregation },
    }),
  )
}

function activeOf(congregation: number) {
  return withScope(congregation, async db =>
    Object.fromEntries(
      (
        await db.building.findMany({ where: { congregationId: congregation }, select: { number: true, active: true } })
      ).map(b => [b.number, b.active]),
    ),
  )
}

beforeAll(async () => {
  const one = await unscopedDb.congregation.create({
    data: { name: `Deactivate ${ts}`, slug: `deactivate-${ts}`, active: true },
  })
  const two = await unscopedDb.congregation.create({
    data: { name: `Deactivate other ${ts}`, slug: `deactivate-other-${ts}`, active: true },
  })
  congregationId = one.id
  otherCongregationId = two.id
})

afterAll(async () => {
  for (const id of [congregationId, otherCongregationId]) {
    await withScope(id, db => db.building.deleteMany({ where: { congregationId: id } }))
    await unscopedDb.congregation.delete({ where: { id } })
  }
})

describe('deactivateBuildings', () => {
  it('deactivates the chosen buildings of the congregation only, and says how many it changed', async () => {
    const first = await create(congregationId, '1')
    const second = await create(congregationId, '2')
    const already = await create(congregationId, '3', false)
    await create(congregationId, '4')
    const elsewhere = await create(otherCongregationId, '1')

    const count = await withScope(congregationId, db =>
      deactivateBuildings(db, {
        buildingIds: [first.id, second.id, already.id, elsewhere.id],
        congregationId,
        actorId: 7,
      }),
    )

    expect(count).toBe(2)
    expect(await activeOf(congregationId)).toEqual({ '1': false, '2': false, '3': false, '4': true })
    expect(await activeOf(otherCongregationId)).toEqual({ '1': true })
    expect(audited).toEqual([
      expect.objectContaining({ congregationId, actorId: 7, metadata: { buildingIds: [first.id, second.id] } }),
    ])
  })

  it('does nothing, and records nothing, for an empty choice', async () => {
    audited.length = 0
    expect(
      await withScope(congregationId, db => deactivateBuildings(db, { buildingIds: [], congregationId, actorId: 7 })),
    ).toBe(0)
    expect(audited).toEqual([])
  })
})
