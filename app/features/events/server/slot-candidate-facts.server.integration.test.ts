import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EventTemplateKey } from '~/features/events/model/event-template.type'

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

type Tx = Parameters<Parameters<typeof testDb.$transaction>[0]>[0]

function withScope<T>(congregationId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return testDb.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
    return fn(tx)
  })
}

const { listSlotCandidateFacts } = await import('./slot-candidate-facts.server')

const ts = Date.now()
let congregationId: number
let event: { id: number; templateId: number | null; startDate: Date; endDate: Date }
let freeform: { id: number; templateId: number | null; startDate: Date; endDate: Date }
let editedPartId: number
let editedServiceId: number
// regular: did the part twice. never: never did it. away: declared an absence over the event. busy: holds
// another part of the event. elsewhere: did the same part on another template. reader: was the second speaker.
const members: Record<'regular' | 'never' | 'away' | 'busy' | 'elsewhere' | 'reader' | 'sono', number> = {
  regular: 0,
  never: 0,
  away: 0,
  busy: 0,
  elsewhere: 0,
  reader: 0,
  sono: 0,
}

beforeAll(async () => {
  congregationId = (
    await testDb.congregation.create({ data: { name: `Facts ${ts}`, slug: `facts-${ts}`, active: true } })
  ).id

  await withScope(congregationId, async tx => {
    for (const key of Object.keys(members) as (keyof typeof members)[]) {
      members[key] = (await tx.member.create({ data: { firstname: key, lastname: 'Test', congregationId } })).id
    }
    const author = await tx.userAccount.create({
      data: { email: `facts-author-${ts}@test.com`, password: 'hashed', active: true, congregationId },
    })
    const awayAccount = await tx.userAccount.create({
      data: {
        email: `facts-away-${ts}@test.com`,
        password: 'hashed',
        active: true,
        congregationId,
        memberId: members.away,
      },
    })

    const meeting = await tx.eventTemplate.create({ data: { name: 'Semaine', key: `week-${ts}`, congregationId } })
    const other = await tx.eventTemplate.create({ data: { name: 'Autre', key: `other-${ts}`, congregationId } })
    const dayOff = await tx.eventTemplate.create({
      data: { name: 'Absence', key: EventTemplateKey.DayOff, congregationId },
    })

    const at = (day: string, templateId: number | null, createdById = author.id) =>
      tx.event.create({
        data: {
          name: 'Réunion',
          templateId,
          startDate: new Date(`${day}T17:00:00Z`),
          endDate: new Date(`${day}T19:00:00Z`),
          createdById,
          congregationId,
        },
      })

    event = await at('2026-11-12', meeting.id)
    freeform = await at('2026-11-12', null)
    const longAgo = await at('2024-03-01', meeting.id)
    const lastSummer = await at('2025-08-18', meeting.id)
    const onOther = await at('2026-06-01', other.id)
    const later = await at('2026-12-10', meeting.id)

    const part = (eventId: number, name: string, assigneeId: number | null, assistantId: number | null = null) =>
      tx.eventPart.create({ data: { name, section: 'Joyaux', eventId, assigneeId, assistantId, congregationId } })

    editedPartId = (await part(event.id, 'Lecture de la Bible', members.never)).id
    await part(event.id, 'Discours', members.busy)
    await part(longAgo.id, 'Lecture de la Bible', members.regular)
    await part(lastSummer.id, ' lecture de la bible', members.regular, members.reader)
    await part(onOther.id, 'Lecture de la Bible', members.elsewhere)
    // A future time does not make it « the last time ».
    await part(later.id, 'Lecture de la Bible', members.never)

    editedServiceId = (await tx.eventServicePart.create({ data: { name: 'Sono', eventId: event.id, congregationId } }))
      .id
    await tx.eventServicePart.create({
      data: { name: 'Sono', eventId: lastSummer.id, assigneeId: members.sono, congregationId },
    })

    await tx.event.create({
      data: {
        name: 'Absence',
        templateId: dayOff.id,
        startDate: new Date('2026-11-10T00:00:00Z'),
        endDate: new Date('2026-11-16T23:59:00Z'),
        createdById: awayAccount.id,
        congregationId,
      },
    })
  })
})

afterAll(async () => {
  if (congregationId) {
    await withScope(congregationId, async tx => {
      await tx.eventServicePart.deleteMany({})
      await tx.eventPart.deleteMany({})
      await tx.event.deleteMany({})
      await tx.eventTemplate.deleteMany({})
      await tx.userAccount.deleteMany({})
      await tx.member.deleteMany({})
    })
    await testDb.congregation.deleteMany({ where: { id: congregationId } })
  }
  await testDb.$disconnect()
})

const partTarget = (slot: 'assignee' | 'assistant') => ({
  kind: 'part' as const,
  assignmentId: editedPartId,
  partName: 'Lecture de la Bible',
  partSection: 'Joyaux',
  slot,
})

describe('listSlotCandidateFacts', () => {
  it('gives the last time each person held the slot, over every past event of the template', async () => {
    const facts = await withScope(congregationId, tx =>
      listSlotCandidateFacts(tx, { event, congregationId, target: partTarget('assignee') }),
    )
    expect(facts.lastAssignedAt).toEqual({ [members.regular]: new Date('2025-08-18T17:00:00Z').toISOString() })
  })

  it('counts the second speaker slot on its own', async () => {
    const facts = await withScope(congregationId, tx =>
      listSlotCandidateFacts(tx, { event, congregationId, target: partTarget('assistant') }),
    )
    expect(facts.lastAssignedAt).toEqual({ [members.reader]: new Date('2025-08-18T17:00:00Z').toISOString() })
  })

  it('gives the absence that covers the event, for whoever declared one', async () => {
    const facts = await withScope(congregationId, tx =>
      listSlotCandidateFacts(tx, { event, congregationId, target: partTarget('assignee') }),
    )
    expect(facts.absences).toEqual({
      [members.away]: {
        startDate: new Date('2026-11-10T00:00:00Z').toISOString(),
        endDate: new Date('2026-11-16T23:59:00Z').toISOString(),
      },
    })
  })

  it('lists what each person already holds at the event, leaving out the slot being edited', async () => {
    const facts = await withScope(congregationId, tx =>
      listSlotCandidateFacts(tx, { event, congregationId, target: partTarget('assignee') }),
    )
    expect(facts.elsewhere).toEqual({ [members.busy]: ['Discours'] })
  })

  it('works the same way for a service', async () => {
    const facts = await withScope(congregationId, tx =>
      listSlotCandidateFacts(tx, {
        event,
        congregationId,
        target: { kind: 'service', assignmentId: editedServiceId, serviceName: 'Sono' },
      }),
    )
    expect(facts.lastAssignedAt).toEqual({ [members.sono]: new Date('2025-08-18T17:00:00Z').toISOString() })
    expect(facts.elsewhere).toEqual({ [members.never]: ['Lecture de la Bible'], [members.busy]: ['Discours'] })
  })

  it('has no history to give on an event without a template', async () => {
    const facts = await withScope(congregationId, tx =>
      listSlotCandidateFacts(tx, { event: freeform, congregationId, target: partTarget('assignee') }),
    )
    expect(facts.lastAssignedAt).toEqual({})
    expect(Object.keys(facts.absences)).toEqual([String(members.away)])
  })
})
