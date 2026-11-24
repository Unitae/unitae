import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner. The shipped SQL is read
// and run inside a transaction that is rolled back, so a later edit of the file is what gets tested.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

afterAll(async () => {
  await testDb.$disconnect()
})

const statements = readFileSync(
  join(import.meta.dirname, '20261128090000_duties_own_responsible', 'migration.sql'),
  'utf8',
)
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map(statement => statement.trim())
  .filter(Boolean)

class Rollback extends Error {}

interface Snapshot {
  programmeOnly: (number | null)[]
  /** The services rows of the kind naming a programme responsible only, after the migration. */
  writtenOnce: { roleId: number; scope: string }[]
  /** A kind with services but no responsible at all. */
  nobody: (number | null)[]
  nobodyRows: number
  withService: (number | null)[]
  unlinked: number | null
  programmeTemplate: number | null
  rerun: number
  programmeRole: number
  serviceRole: number
}

let snapshot: Promise<Snapshot> | undefined

/** One fixture, run once: kinds as the two schedule migrations left them, then this migration twice. */
function migrated(): Promise<Snapshot> {
  snapshot ??= (async () => {
    let captured: Snapshot | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `duties-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          const role = async (suffix: string) =>
            (await tx.role.create({ data: { key: `${stamp}-${suffix}`, congregationId } })).id
          const programmeRole = await role('p')
          const serviceRole = await role('s')
          // A kind naming a programme responsible only: its duties took that role through the derivation's fallback.
          const kind = async (suffix: string, scopes: [number, string][]) => {
            const id = (
              await tx.eventTemplate.create({ data: { name: suffix, key: `${stamp}-${suffix}`, congregationId } })
            ).id
            for (const [roleId, scope] of scopes) {
              await tx.templateResponsible.create({ data: { templateId: id, roleId, scope, congregationId } })
            }
            return id
          }
          const template = async (kindId: number | null, kindName: 'programme' | 'duty', roleId: number | null) => {
            const id = (
              await tx.scheduleTemplate.create({
                data: {
                  name: kindName === 'programme' ? 'Programme' : null,
                  key: kindName === 'duty' ? 'services' : null,
                  kind: kindName,
                  responsibleRoleId: roleId,
                  congregationId,
                },
              })
            ).id
            if (kindId != null) {
              await tx.eventKindScheduleTemplate.create({
                data: { eventKindId: kindId, scheduleTemplateId: id, order: 0, congregationId },
              })
            }
            return id
          }
          const midweek = await kind('midweek', [[programmeRole, 'programme']])
          const weekend = await kind('weekend', [
            [programmeRole, 'programme'],
            [serviceRole, 'service'],
          ])
          const visit = await kind('visit', [])
          const visitDuties = await template(visit, 'duty', null)
          const midweekProgramme = await template(midweek, 'programme', programmeRole)
          const midweekDuties = await template(midweek, 'duty', programmeRole)
          const weekendDuties = await template(weekend, 'duty', serviceRole)
          const unlinked = await template(null, 'duty', programmeRole)

          for (const statement of statements) await tx.$executeRawUnsafe(statement)
          const roleOf = async (id: number) =>
            (await tx.scheduleTemplate.findFirstOrThrow({ where: { id } })).responsibleRoleId
          const first = {
            midweek: await roleOf(midweekDuties),
            weekend: await roleOf(weekendDuties),
            visit: await roleOf(visitDuties),
          }
          let rerun = 0
          for (const statement of statements) rerun += await tx.$executeRawUnsafe(statement)

          captured = {
            programmeOnly: [first.midweek, await roleOf(midweekDuties)],
            writtenOnce: await tx.templateResponsible.findMany({
              where: { templateId: midweek, scope: 'service' },
              select: { roleId: true, scope: true },
            }),
            nobody: [first.visit, await roleOf(visitDuties)],
            nobodyRows: await tx.templateResponsible.count({ where: { templateId: visit } }),
            withService: [first.weekend, await roleOf(weekendDuties)],
            unlinked: await roleOf(unlinked),
            programmeTemplate: await roleOf(midweekProgramme),
            rerun,
            programmeRole,
            serviceRole,
          }
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    if (captured == null) throw new Error('the fixture captured nothing')
    return captured
  })()
  return snapshot
}

describe('20261128090000_duties_own_responsible', () => {
  it('writes the role a duties template inherits from the programme once, as the kind’s services responsible', async () => {
    const { programmeOnly, writtenOnce, programmeRole } = await migrated()
    expect(programmeOnly).toEqual([programmeRole, programmeRole])
    expect(writtenOnce).toEqual([{ roleId: programmeRole, scope: 'service' }])
  })

  it('names no one for a kind that names no responsible', async () => {
    const { nobody, nobodyRows } = await migrated()
    expect(nobody).toEqual([null, null])
    expect(nobodyRows).toBe(0)
  })

  it('keeps the services responsible a kind names', async () => {
    const { withService, serviceRole } = await migrated()
    expect(withService).toEqual([serviceRole, serviceRole])
  })

  it('leaves a programme template and a template no kind suggests alone', async () => {
    const { programmeTemplate, unlinked, programmeRole } = await migrated()
    expect(programmeTemplate).toBe(programmeRole)
    expect(unlinked).toBe(programmeRole)
  })

  it('changes nothing when run again', async () => {
    expect((await migrated()).rerun).toBe(0)
  })
})
