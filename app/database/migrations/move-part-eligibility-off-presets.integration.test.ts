import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the
// schema owner, and this test recreates a dropped table, which the RLS-bound
// runtime role cannot do.
const adapter = new PrismaPg({
  connectionString: process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const MIGRATION_SQL = resolve(import.meta.dirname, '20260824000000_move_part_eligibility_off_presets', 'migration.sql')

// The table as it stood before this migration dropped it, copied from
// 20260821000000_add_part_preset. Without it there is no "before" to migrate.
const RECREATE_DROPPED_TABLE = `
  CREATE TABLE "PartPresetAllowedRole" (
    "presetId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "asKind" TEXT NOT NULL,
    "congregationId" INTEGER NOT NULL,
    CONSTRAINT "PartPresetAllowedRole_pkey" PRIMARY KEY ("presetId","roleId","asKind")
  )
`

/**
 * The real migration file, split into statements.
 *
 * Reading the shipped artifact rather than a paraphrase is the point: a test
 * that re-typed the SQL would keep passing after someone edited the file.
 */
function migrationStatements(): string[] {
  return readFileSync(MIGRATION_SQL, 'utf8')
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0)
}

/** Thrown to roll the fixture back; every assertion runs on captured values. */
class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

interface Captured {
  roleFromKindId: number
  roleFromPartId: number
  templateSpeaker: number[]
  templateReaderUntouchedByKind: number[]
  templateNoPreset: number[]
  eventSpeaker: number[]
  mergedKeys: string[]
  customPresetSurvives: number
  legacyPresetsGone: number
}

async function runMigrationOverFixture(): Promise<Captured> {
  let captured: Captured | undefined

  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `mig-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregation = await tx.congregation.create({
          data: { name: stamp, slug: stamp, active: true },
        })
        const congregationId = congregation.id

        const roleFromKind = await tx.role.create({
          data: { key: `${stamp}-kind`, name: 'Depuis le type', isBuiltIn: false, congregationId },
        })
        const roleFromPart = await tx.role.create({
          data: { key: `${stamp}-part`, name: 'Depuis la partie', isBuiltIn: false, congregationId },
        })

        const gems = await tx.partPreset.create({
          data: { key: 'spiritual-gems', scope: 'part', isSystem: true, congregationId },
        })
        const christianLife = await tx.partPreset.create({
          data: { key: 'christian-life-talk', scope: 'part', isSystem: true, congregationId },
        })
        const custom = await tx.partPreset.create({
          data: { key: 'spiritual-gems-2', name: 'Mon type', scope: 'part', isSystem: false, congregationId },
        })

        const template = await tx.eventTemplate.create({
          data: { name: stamp, key: `${stamp}-tpl`, startTime: '19:00', endTime: '21:00', congregationId },
        })
        const author = await tx.userAccount.create({
          data: {
            email: `${stamp}@test.invalid`,
            password: 'hashed',
            firstname: 'Mig',
            lastname: 'Ration',
            active: true,
            congregationId,
          },
        })
        const event = await tx.event.create({
          data: {
            name: stamp,
            startDate: new Date('2026-01-01T19:00:00Z'),
            endDate: new Date('2026-01-01T21:00:00Z'),
            templateId: template.id,
            createdById: author.id,
            congregationId,
          },
        })

        // The kind restricts this slot, so under the old rule the kind's list
        // was the answer and the part's own row lay dormant.
        const partKindWins = await tx.templatePart.create({
          data: { name: 'A', order: 1, templateId: template.id, presetId: gems.id, congregationId },
        })
        // The kind says nothing about the reader slot, so the part's own row
        // was already the answer and has to survive untouched.
        const partReaderOwn = await tx.templatePart.create({
          data: { name: 'B', order: 2, templateId: template.id, presetId: gems.id, congregationId },
        })
        const partNoPreset = await tx.templatePart.create({
          data: { name: 'C', order: 3, templateId: template.id, congregationId },
        })
        const eventPart = await tx.eventPart.create({
          data: { name: 'D', order: 1, eventId: event.id, presetId: christianLife.id, congregationId },
        })

        await tx.templatePartAllowedRole.createMany({
          data: [
            { partId: partKindWins.id, roleId: roleFromPart.id, asKind: 'speaker', congregationId },
            { partId: partReaderOwn.id, roleId: roleFromPart.id, asKind: 'reader', congregationId },
            { partId: partNoPreset.id, roleId: roleFromPart.id, asKind: 'speaker', congregationId },
          ],
        })
        await tx.eventPartAllowedRole.createMany({
          data: [{ eventPartId: eventPart.id, roleId: roleFromPart.id, asKind: 'speaker', congregationId }],
        })

        await tx.$executeRawUnsafe(RECREATE_DROPPED_TABLE)
        await tx.$executeRawUnsafe(
          `INSERT INTO "PartPresetAllowedRole" ("presetId", "roleId", "asKind", "congregationId")
           VALUES ($1, $2, 'speaker', $3), ($4, $2, 'speaker', $3)`,
          gems.id,
          roleFromKind.id,
          congregationId,
          christianLife.id,
        )

        for (const statement of migrationStatements()) {
          await tx.$executeRawUnsafe(statement)
        }

        const speakerRoles = async (partId: number) =>
          (
            await tx.templatePartAllowedRole.findMany({
              where: { partId, asKind: 'speaker' },
              select: { roleId: true },
            })
          ).map(r => r.roleId)

        const merged = await tx.partPreset.findMany({
          where: { congregationId, id: { not: custom.id } },
          select: { key: true },
        })

        captured = {
          roleFromKindId: roleFromKind.id,
          roleFromPartId: roleFromPart.id,
          templateSpeaker: await speakerRoles(partKindWins.id),
          templateReaderUntouchedByKind: (
            await tx.templatePartAllowedRole.findMany({
              where: { partId: partReaderOwn.id, asKind: 'reader' },
              select: { roleId: true },
            })
          ).map(r => r.roleId),
          templateNoPreset: await speakerRoles(partNoPreset.id),
          eventSpeaker: (
            await tx.eventPartAllowedRole.findMany({
              where: { eventPartId: eventPart.id, asKind: 'speaker' },
              select: { roleId: true },
            })
          ).map(r => r.roleId),
          mergedKeys: merged.map(p => p.key).sort(),
          customPresetSurvives: await tx.partPreset.count({ where: { id: custom.id } }),
          legacyPresetsGone: await tx.partPreset.count({
            where: { congregationId, key: { in: ['spiritual-gems', 'spiritual-pearls', 'christian-life-talk'] } },
          }),
        }

        // Everything above, including the recreated table, unwinds here.
        throw new Rollback()
      },
      { timeout: 25_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }

  if (!captured) throw new Error('fixture never ran')
  return captured
}

describe('20260824000000_move_part_eligibility_off_presets', () => {
  it('materializes the eligibility each part actually resolved to, and merges the midweek kinds', async () => {
    const result = await runMigrationOverFixture()

    // The kind's list decided this slot before, so it must be the part's now:
    // the kind's role, and specifically NOT the dormant one the part carried.
    expect(result.templateSpeaker).toEqual([result.roleFromKindId])

    // The kind restricted nobody here, so the part's own row was already the
    // answer. Losing it would widen the slot to every member.
    expect(result.templateReaderUntouchedByKind).toEqual([result.roleFromPartId])

    // No kind, nothing to resolve, nothing to change.
    expect(result.templateNoPreset).toEqual([result.roleFromPartId])

    // Event parts resolve by the same rule as template parts.
    expect(result.eventSpeaker).toEqual([result.roleFromKindId])

    // The three midweek kinds collapse to one, and the parts that used them
    // are repointed rather than orphaned.
    expect(result.mergedKeys).toEqual(['midweek-talk'])
    expect(result.legacyPresetsGone).toBe(0)

    // A congregation's own kind is not system-seeded and must not be folded.
    expect(result.customPresetSurvives).toBe(1)
  })
})
