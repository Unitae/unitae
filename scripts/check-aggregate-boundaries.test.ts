import { describe, expect, it } from 'vitest'
import { analyzeSource } from './check-aggregate-boundaries'

describe('analyzeSource — rule 1: writes on aggregate models', () => {
  it('flags db.member.update outside an aggregate/allowlist file', () => {
    const source = 'await db.member.update({ where: { id }, data: {} })'
    const v = analyzeSource('app/features/settings/server/link-thing.server.ts', source)
    expect(v).toHaveLength(1)
    expect(v[0].rule).toBe('write-outside-aggregate')
    expect(v[0].line).toBe(1)
  })

  it('flags db.attribution.delete outside an aggregate/allowlist file', () => {
    const v = analyzeSource(
      'app/features/settings/server/other.server.ts',
      'return db.attribution.delete({ where: { id } })',
    )
    expect(v).toHaveLength(1)
    expect(v[0].rule).toBe('write-outside-aggregate')
  })

  it('allows the write inside a *.aggregate.ts file', () => {
    const source = 'await db.member.create({ data })'
    const v = analyzeSource('app/features/publishers/server/member.aggregate.ts', source)
    expect(v).toHaveLength(0)
  })

  it('allows the write inside an import-*.server.ts orchestrator', () => {
    const source = 'await db.member.create({ data })'
    const v = analyzeSource('app/features/settings/server/import-publishers.server.ts', source)
    expect(v).toHaveLength(0)
  })

  it('allows the write inside a test file', () => {
    const source = 'db.attribution.deleteMany({})'
    for (const path of [
      'app/features/territories/server/attribution.server.test.ts',
      'app/features/settings/server/data-transfer.integration.test.ts',
      'app/tests/e2e/attribution.spec.ts',
    ]) {
      expect(analyzeSource(path, source)).toHaveLength(0)
    }
  })

  it('flags prisma.member.create outside an aggregate/allowlist file', () => {
    const source = 'const m = await prisma.member.create({ data: {} })'
    const v = analyzeSource('app/features/publishers/server/thing.server.ts', source)
    expect(v).toHaveLength(1)
    expect(v[0].rule).toBe('write-outside-aggregate')
  })

  it('allows the write inside an app/database seed script', () => {
    const source = 'const m = await prisma.member.create({ data: {} })'
    for (const path of ['app/database/seed.ts', 'app/database/seed-marketing.ts']) {
      expect(analyzeSource(path, source)).toHaveLength(0)
    }
  })

  it('does not flag writes on non-aggregate models', () => {
    const source = 'await db.role.update({ where, data })'
    const v = analyzeSource('app/features/settings/server/roles.server.ts', source)
    expect(v).toHaveLength(0)
  })

  it('does not flag lines that look like writes inside a comment', () => {
    const v = analyzeSource(
      'app/features/settings/server/notes.server.ts',
      '  // db.member.update was moved to the aggregate',
    )
    expect(v).toHaveLength(0)
  })
})

describe('analyzeSource — rule 2: UI-style reads inside aggregate', () => {
  it('flags a findMany outside an _assert helper', () => {
    const source = ['export async function listStuff(db) {', '  return db.member.findMany({ where: {} })', '}'].join(
      '\n',
    )
    const v = analyzeSource('app/features/publishers/server/member.aggregate.ts', source)
    expect(v).toHaveLength(1)
    expect(v[0].rule).toBe('ui-read-inside-aggregate')
    expect(v[0].line).toBe(2)
  })

  it('flags count and aggregate calls too', () => {
    const source = [
      'export function stats(db) {',
      '  const c = db.member.count({})',
      '  const a = db.member.aggregate({})',
      '  return { c, a }',
      '}',
    ].join('\n')
    const v = analyzeSource('app/features/publishers/server/member.aggregate.ts', source)
    expect(v).toHaveLength(2)
  })

  it('allows findMany inside a function prefixed _assert', () => {
    const source = [
      'async function _assertNoOverlap(db) {',
      '  const rows = await db.attribution.findMany({ where: {} })',
      '  return rows',
      '}',
    ].join('\n')
    const v = analyzeSource('app/features/territories/server/attribution.aggregate.ts', source)
    expect(v).toHaveLength(0)
  })

  it('allows findMany on a line preceded by an allow-comment', () => {
    const source = [
      'export async function bulk(db) {',
      '  // aggregate-boundaries-allow: precondition read feeding an updateMany',
      '  const rows = await db.member.findMany({ where: {} })',
      '  return rows',
      '}',
    ].join('\n')
    const v = analyzeSource('app/features/publishers/server/member.aggregate.ts', source)
    expect(v).toHaveLength(0)
  })

  it('never flags findFirst / findUnique — those are precondition shapes', () => {
    const source = [
      'export async function load(db, id) {',
      '  const one = await db.member.findFirst({ where: { id } })',
      '  const two = await db.member.findUnique({ where: { id } })',
      '  return { one, two }',
      '}',
    ].join('\n')
    const v = analyzeSource('app/features/publishers/server/member.aggregate.ts', source)
    expect(v).toHaveLength(0)
  })

  it('does not apply the read rule outside .aggregate.ts files', () => {
    const source = 'export const list = (db) => db.member.findMany({})'
    const v = analyzeSource('app/features/publishers/server/publishers.server.ts', source)
    expect(v).toHaveLength(0)
  })

  it('resets the enclosing function tracking at each new function declaration', () => {
    // A subsequent non-_assert function must not inherit the allowlisting.
    const source = [
      'function _assertOk(db) {',
      '  return db.member.findMany({})',
      '}',
      '',
      'export function stats(db) {',
      '  return db.member.findMany({})',
      '}',
    ].join('\n')
    const v = analyzeSource('app/features/publishers/server/member.aggregate.ts', source)
    expect(v).toHaveLength(1)
    expect(v[0].line).toBe(6)
  })
})
