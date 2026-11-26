import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import { BUILT_IN_ROLE_KEYS } from '~/shared/domain/built-in-roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// « Nouveau modèle » on « Modèles de planning » (6a-1c-2): a schedule template of parts or of services, named, with a
// responsible the congregation may hand a template to or none, used by no kind yet. In a congregation of its own,
// rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { createScheduleTemplate } = await import('./create-schedule-template.server')

class Rollback extends Error {}

afterAll(async () => {
  await flushPendingAuditWrites()
  await testDb.$disconnect()
})

describe('createScheduleTemplate', () => {
  it('creates a template used by no kind, a programme with its main room, and refuses no name or a role it may not have', async () => {
    let read: Record<string, unknown> | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `create-st-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
          const db = tx as unknown as TransactionClient
          const actorId = (
            await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
          ).id
          const role = await tx.role.create({ data: { key: `av-${stamp}`, name: 'Audio-vidéo', congregationId } })
          // An identity role: who holds it follows the records, never a template's (listDelegatableRoles).
          const identity = await tx.role.create({
            data: { key: BUILT_IN_ROLE_KEYS[0], isBuiltIn: true, congregationId },
          })

          const programme = await createScheduleTemplate(
            db,
            { name: '  Visite  ', kind: 'programme', responsibleRoleId: null },
            congregationId,
            actorId,
          )
          const duties = await createScheduleTemplate(
            db,
            { name: 'Visioconférence', kind: 'duty', responsibleRoleId: role.id },
            congregationId,
            actorId,
          )
          const blank = await createScheduleTemplate(
            db,
            { name: '   ', kind: 'duty', responsibleRoleId: null },
            congregationId,
            actorId,
          )
          const notDelegatable = await createScheduleTemplate(
            db,
            { name: 'Identité', kind: 'duty', responsibleRoleId: identity.id },
            congregationId,
            actorId,
          )
          // A name another template carries, whatever its case, or the label an unnamed one shows, is refused.
          await tx.scheduleTemplate.create({ data: { key: 'duties', kind: 'duty', congregationId } })
          const taken = await createScheduleTemplate(
            db,
            { name: 'visite', kind: 'programme', responsibleRoleId: null },
            congregationId,
            actorId,
          )
          const accents = await createScheduleTemplate(
            db,
            { name: 'Vîsité', kind: 'programme', responsibleRoleId: null },
            congregationId,
            actorId,
          )
          const label = await createScheduleTemplate(
            db,
            { name: 'Services', kind: 'duty', responsibleRoleId: null },
            congregationId,
            actorId,
          )
          await tx.scheduleTemplate.deleteMany({ where: { key: 'duties', congregationId } })
          const templates = await tx.scheduleTemplate.findMany({
            where: { congregationId },
            orderBy: { id: 'asc' },
            select: {
              name: true,
              key: true,
              kind: true,
              responsibleRoleId: true,
              eventKinds: { select: { id: true } },
              rooms: { select: { key: true } },
            },
          })
          await flushPendingAuditWrites()
          const audits = await tx.auditLog.findMany({
            where: { congregationId, action: 'schedule_template.created' },
            select: { entityType: true, metadata: true },
          })
          read = {
            programme,
            duties,
            blank,
            taken,
            accents,
            label,
            notDelegatable,
            templates,
            // Stored as JSON text.
            audits: audits.map(each => ({ ...each, metadata: JSON.parse(String(each.metadata)) })),
            roleId: role.id,
          }
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    if (read == null) throw new Error('nothing read')
    expect(read.programme).toEqual({ ok: true, id: expect.any(Number) })
    expect(read.duties).toEqual({ ok: true, id: expect.any(Number) })
    expect(read.blank).toEqual({ ok: false, reason: 'name' })
    expect(read.taken).toEqual({ ok: false, reason: 'taken' })
    expect(read.accents).toEqual({ ok: false, reason: 'taken' })
    expect(read.label).toEqual({ ok: false, reason: 'taken' })
    expect(read.notDelegatable).toEqual({ ok: false, reason: 'role' })
    expect(read.templates).toEqual([
      {
        name: 'Visite',
        key: null,
        kind: 'programme',
        responsibleRoleId: null,
        eventKinds: [],
        rooms: [{ key: 'main' }],
      },
      {
        name: 'Visioconférence',
        key: null,
        kind: 'duty',
        responsibleRoleId: read.roleId,
        eventKinds: [],
        // Services are held in no room.
        rooms: [],
      },
    ])
    expect(read.audits).toEqual([
      { entityType: 'ScheduleTemplate', metadata: { name: 'Visite', kind: 'programme', responsibleRoleId: null } },
      {
        entityType: 'ScheduleTemplate',
        metadata: { name: 'Visioconférence', kind: 'duty', responsibleRoleId: read.roleId },
      },
    ])
  })
})
