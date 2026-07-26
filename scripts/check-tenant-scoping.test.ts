import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyzeSource, TENANT_MODELS } from './check-tenant-scoping'

const SERVER = 'app/features/territories/server/x.server.ts'
const MODEL_OPEN_RE = /^model\s+(\w+)\s*\{/
const CONGREGATION_ID_FIELD_RE = /^\s*congregationId\s+Int\b/

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

  it('flags a bare-id upsert', () => {
    const src = 'await db.setting.upsert({ where: { id }, create: {}, update: {} })'
    const v = analyzeSource(SERVER, src)
    expect(v).toHaveLength(1)
    expect(v[0].method).toBe('upsert')
  })

  it('passes an upsert scoped by a compound key', () => {
    const src =
      'await db.setting.upsert({ where: { key_congregationId: { key, congregationId } }, create: {}, update: {} })'
    expect(analyzeSource(SERVER, src)).toHaveLength(0)
  })

  it('flags a bare id nested only in an AND combinator', () => {
    const src = 'await db.building.update({ where: { AND: [{ id: buildingId }] }, data: {} })'
    expect(analyzeSource(SERVER, src)).toHaveLength(1)
  })

  it('passes when AND carries both id and congregationId branches', () => {
    const src = 'await db.building.update({ where: { AND: [{ id: buildingId }, { congregationId }] }, data: {} })'
    expect(analyzeSource(SERVER, src)).toHaveLength(0)
  })

  it('flags a bare id inside an OR combinator', () => {
    const src = 'await db.building.findFirst({ where: { OR: [{ id: buildingId }] } })'
    expect(analyzeSource(SERVER, src)).toHaveLength(1)
  })

  it('fails closed on an unparseable call (reports a parse-error, does not silently skip)', () => {
    // Unbalanced parentheses after the matched call — the analyzer cannot prove it safe.
    const src = 'await db.building.delete({ where: { id: fn( } })'
    const v = analyzeSource(SERVER, src)
    expect(v).toHaveLength(1)
    expect(v[0].kind).toBe('parse-error')
  })

  it('does not flag a non-object (variable) where — no literal id to inspect', () => {
    const src = 'await db.building.findFirst(buildingQuery)'
    expect(analyzeSource(SERVER, src)).toHaveLength(0)
  })
})

// Guards against TENANT_MODELS silently drifting from schema.prisma: a new model
// with a congregationId column that is not added here would be exempt from the
// whole check. Mirrors how the sibling boundary checks pin their model lists.
describe('TENANT_MODELS stays in sync with schema.prisma', () => {
  it('lists exactly the models that carry a congregationId column', () => {
    // Line-based scan: a Prisma model spans from `model X {` to a line that is
    // just `}`. (A block regex breaks on `@default("{}")` literals in the body.)
    const schema = readFileSync(join(process.cwd(), 'app/database/schema.prisma'), 'utf8')
    const modelsWithCongregationId = new Set<string>()
    let currentModel: string | null = null
    for (const line of schema.split('\n')) {
      const open = MODEL_OPEN_RE.exec(line)
      if (open) {
        currentModel = open[1]
        continue
      }
      if (currentModel && line.trim() === '}') {
        currentModel = null
        continue
      }
      if (currentModel && CONGREGATION_ID_FIELD_RE.test(line)) {
        modelsWithCongregationId.add(`${currentModel[0].toLowerCase()}${currentModel.slice(1)}`)
      }
    }

    expect([...modelsWithCongregationId].sort()).toEqual([...TENANT_MODELS].sort())
  })
})
