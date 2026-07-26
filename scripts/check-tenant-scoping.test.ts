import { describe, expect, it } from 'vitest'
import { analyzeSource } from './check-tenant-scoping'

const SERVER = 'app/features/territories/server/x.server.ts'

describe('analyzeSource — tenant-scoping', () => {
  it('flags a bare-id findFirst on a tenant model', () => {
    const src = 'await db.territory.findFirst({ where: { id: territoryId } })'
    const v = analyzeSource(SERVER, src)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ model: 'territory', method: 'findFirst', line: 1 })
  })

  it('flags a bare-id update and delete', () => {
    const src = [
      'await db.building.update({ where: { id: buildingId }, data: {} })',
      'await db.building.delete({ where: { id: buildingId } })',
    ].join('\n')
    expect(analyzeSource(SERVER, src)).toHaveLength(2)
  })

  it('passes when congregationId is present alongside id', () => {
    const src = 'await db.territory.findFirst({ where: { id: territoryId, congregationId } })'
    expect(analyzeSource(SERVER, src)).toHaveLength(0)
  })

  it('passes when the id_congregationId compound key is used', () => {
    const src = 'await db.territory.update({ where: { id_congregationId: { id, congregationId } }, data: {} })'
    expect(analyzeSource(SERVER, src)).toHaveLength(0)
  })

  it('does not flag a nested relation filter whose inner object has an id', () => {
    // `id` here belongs to the `territories.some` relation filter, not the row.
    const src = 'await db.buildingEntrance.findFirst({ where: { congregationId, territories: { some: { id } } } })'
    expect(analyzeSource(SERVER, src)).toHaveLength(0)
  })

  it('flags a nested-only id (relation filter) when the top-level where has a bare id', () => {
    const src = 'await db.buildingEntrance.update({ where: { id: entranceId, territories: { some: { id } } } })'
    expect(analyzeSource(SERVER, src)).toHaveLength(1)
  })

  it('handles a multi-line where block (block-aware, not single-line)', () => {
    const src = ['await db.publisherGroup.findUnique({', '  where: {', '    id: groupId,', '  },', '})'].join('\n')
    const v = analyzeSource(SERVER, src)
    expect(v).toHaveLength(1)
    expect(v[0].line).toBe(1)
  })

  it('flags a batch where: { id: { in } } without congregationId', () => {
    const src = 'await db.notificationEvent.updateMany({ where: { id: { in: ids } }, data: {} })'
    expect(analyzeSource(SERVER, src)).toHaveLength(1)
  })

  it('passes a batch where: { id: { in }, congregationId }', () => {
    const src = 'await db.notificationEvent.updateMany({ where: { id: { in: ids }, congregationId }, data: {} })'
    expect(analyzeSource(SERVER, src)).toHaveLength(0)
  })

  it('does not match the unscopedDb receiver', () => {
    const src = 'await unscopedDb.userAccount.findUnique({ where: { id: userId } })'
    expect(analyzeSource(SERVER, src)).toHaveLength(0)
  })

  it('does not match a worker tx receiver', () => {
    const src = 'await tx.notificationEvent.updateMany({ where: { id: { in: ids } }, data: {} })'
    expect(analyzeSource(SERVER, src)).toHaveLength(0)
  })

  it('ignores non-tenant models', () => {
    const src = 'await db.permission.findUnique({ where: { id } })'
    expect(analyzeSource(SERVER, src)).toHaveLength(0)
  })

  it('honours a // tenant-scoping-allow comment on the preceding line', () => {
    const src = [
      '// tenant-scoping-allow: id is a verified congregation-owned value',
      'db.building.delete({ where: { id } })',
    ].join('\n')
    expect(analyzeSource(SERVER, src)).toHaveLength(0)
  })

  it('exempts authentication files', () => {
    const src = 'await db.userAccount.findUnique({ where: { id: userId } })'
    expect(analyzeSource('app/features/authentication/server/session.server.ts', src)).toHaveLength(0)
  })

  it('exempts platform-admin files', () => {
    const src = 'await db.userAccount.findUnique({ where: { id: userId } })'
    expect(analyzeSource('app/features/platform-admin/server/x.server.ts', src)).toHaveLength(0)
  })

  it('exempts test files and the seed directory', () => {
    const src = 'await db.building.delete({ where: { id } })'
    expect(analyzeSource('app/features/territories/server/x.server.test.ts', src)).toHaveLength(0)
    expect(analyzeSource('app/database/seed.ts', src)).toHaveLength(0)
  })

  it('detects the shorthand { id } form as a bare id', () => {
    const src = 'await db.building.delete({ where: { id } })'
    expect(analyzeSource(SERVER, src)).toHaveLength(1)
  })
})
