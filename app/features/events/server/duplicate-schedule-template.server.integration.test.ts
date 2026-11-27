import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// « Dupliquer » on a schedule template (user, 2026-11-27): another template, used by no type yet, with copies of its
// parts (sections, labels, kinds, who may take each, the rooms each is held in) or of its services (who may take each).
// The source is left as it was. In a congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { duplicateScheduleTemplate } = await import('./duplicate-schedule-template.server')

class Rollback extends Error {}

afterAll(async () => {
  await flushPendingAuditWrites()
  await testDb.$disconnect()
})

type Tx = Parameters<Parameters<typeof testDb.$transaction>[0]>[0]

async function inCongregation<T>(
  fn: (tx: Tx, db: TransactionClient, congregationId: number, actorId: number) => Promise<T>,
) {
  let out: T | undefined
  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `dup-st-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        const actorId = (
          await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
        ).id
        out = await fn(tx, tx as unknown as TransactionClient, congregationId, actorId)
        throw new Rollback()
      },
      { timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  return out as T
}

const partShape = {
  name: true,
  section: true,
  order: true,
  durationMin: true,
  speakerLabel: true,
  readerLabel: true,
  presetId: true,
  allowExternalSpeaker: true,
  templateId: true,
  allowedRoles: { select: { roleId: true, asKind: true }, orderBy: { asKind: 'asc' } },
  rooms: { select: { room: { select: { key: true, name: true } } }, orderBy: { roomId: 'asc' } },
} as const

describe('duplicateScheduleTemplate', () => {
  it('copies a programme template’s parts, their roles and rooms, under a name of its own, used by no type', async () => {
    const read = await inCongregation(async (tx, db, congregationId, actorId) => {
      const role = (await tx.role.create({ data: { key: `r-${congregationId}`, name: 'Lecteurs', congregationId } })).id
      const kind = (
        await tx.eventTemplate.create({ data: { name: 'Visite', key: `k-${congregationId}`, congregationId } })
      ).id
      const source = await tx.scheduleTemplate.create({
        data: { name: 'Visite', kind: 'programme', responsibleRoleId: role, congregationId },
      })
      await tx.eventKindScheduleTemplate.create({
        data: { eventKindId: kind, scheduleTemplateId: source.id, congregationId },
      })
      await tx.scheduleTemplateRoom.updateMany({
        where: { scheduleTemplateId: source.id, key: 'main' },
        data: { name: 'Auditorium' },
      })
      const salleB = await tx.scheduleTemplateRoom.create({
        data: { name: 'Salle B', order: 1, scheduleTemplateId: source.id, congregationId },
      })
      const main = await tx.scheduleTemplateRoom.findFirstOrThrow({
        where: { scheduleTemplateId: source.id, key: 'main' },
      })
      const base = { track: '', scheduleTemplateId: source.id, congregationId }
      const reading = await tx.templatePart.create({
        data: {
          ...base,
          name: 'Lecture',
          section: 'Joyaux',
          order: 0,
          durationMin: 4,
          speakerLabel: 'Lecteur',
          templateId: kind,
        },
      })
      await tx.templatePart.create({ data: { ...base, name: 'Prière', section: '', order: 1, readerLabel: 'Frère' } })
      await tx.templatePartAllowedRole.create({
        data: { partId: reading.id, roleId: role, asKind: 'speaker', congregationId },
      })
      // The main room's row comes with the part (its trigger): Salle B is added beside it.
      await tx.templatePartRoom.create({ data: { templatePartId: reading.id, roomId: salleB.id, congregationId } })
      const before = await tx.templatePart.count({ where: { scheduleTemplateId: source.id } })

      const result = await duplicateScheduleTemplate(db, source.id, congregationId, actorId)
      const id = result?.id ?? -1
      return {
        result: result != null,
        copy: await tx.scheduleTemplate.findFirstOrThrow({
          where: { id },
          select: { name: true, kind: true, responsibleRoleId: true, _count: { select: { eventKinds: true } } },
        }),
        rooms: await tx.scheduleTemplateRoom.findMany({
          where: { scheduleTemplateId: id },
          orderBy: { order: 'asc' },
          select: { key: true, name: true },
        }),
        parts: await tx.templatePart.findMany({
          where: { scheduleTemplateId: id },
          orderBy: { order: 'asc' },
          select: partShape,
        }),
        sourceParts: await tx.templatePart.count({ where: { scheduleTemplateId: source.id } }),
        before,
        role,
      }
    })
    expect(read.result).toBe(true)
    expect(read.copy).toEqual({
      name: 'Visite (copie)',
      kind: 'programme',
      responsibleRoleId: read.role,
      _count: { eventKinds: 0 },
    })
    expect(read.rooms).toEqual([
      { key: 'main', name: 'Auditorium' },
      { key: null, name: 'Salle B' },
    ])
    expect(read.parts).toEqual([
      {
        name: 'Lecture',
        section: 'Joyaux',
        order: 0,
        durationMin: 4,
        speakerLabel: 'Lecteur',
        readerLabel: null,
        presetId: null,
        allowExternalSpeaker: false,
        templateId: null,
        allowedRoles: [{ roleId: read.role, asKind: 'speaker' }],
        rooms: [{ room: { key: 'main', name: 'Auditorium' } }, { room: { key: null, name: 'Salle B' } }],
      },
      {
        name: 'Prière',
        section: '',
        order: 1,
        durationMin: null,
        speakerLabel: null,
        readerLabel: 'Frère',
        presetId: null,
        allowExternalSpeaker: false,
        templateId: null,
        allowedRoles: [],
        // Every part is held in the main room, as its source.
        rooms: [{ room: { key: 'main', name: 'Auditorium' } }],
      },
    ])
    expect(read.sourceParts).toBe(read.before)
  })

  it('names the copy of an unnamed duties template after its label, and copies its services with their roles', async () => {
    const read = await inCongregation(async (tx, db, congregationId, actorId) => {
      const role = (await tx.role.create({ data: { key: `r-${congregationId}`, name: 'Sono', congregationId } })).id
      const source = await tx.scheduleTemplate.create({ data: { key: 'services', kind: 'duty', congregationId } })
      const service = await tx.templateServicePart.create({
        data: { name: 'Micro', key: 'micro', order: 2, scheduleTemplateId: source.id, congregationId },
      })
      await tx.templateServicePartAllowedRole.create({
        data: { servicePartId: service.id, roleId: role, congregationId },
      })
      const first = await duplicateScheduleTemplate(db, source.id, congregationId, actorId)
      const second = await duplicateScheduleTemplate(db, source.id, congregationId, actorId)
      const names = await tx.scheduleTemplate.findMany({
        where: { id: { in: [first?.id ?? -1, second?.id ?? -1] } },
        orderBy: { id: 'asc' },
        select: { name: true, key: true },
      })
      const services = await tx.templateServicePart.findMany({
        where: { scheduleTemplateId: first?.id ?? -1 },
        select: { name: true, order: true, templateId: true, allowedRoles: { select: { roleId: true } } },
      })
      return { names, services, role }
    })
    expect(read.names).toEqual([
      { name: 'Services (copie)', key: null },
      { name: 'Services (copie 2)', key: null },
    ])
    expect(read.services).toEqual([
      { name: 'Micro', order: 2, templateId: null, allowedRoles: [{ roleId: read.role }] },
    ])
  })

  it('answers null for a template it cannot read', async () => {
    const read = await inCongregation((_tx, db, congregationId, actorId) =>
      duplicateScheduleTemplate(db, -1, congregationId, actorId),
    )
    expect(read).toBeNull()
  })
})
