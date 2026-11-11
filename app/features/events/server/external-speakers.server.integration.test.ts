import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

vi.mock('~/shared/domain/audit.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/domain/audit.server')>()),
  audit: vi.fn(),
}))

// The two writes a mocked client cannot vouch for: deleting a speaker frees his planned talks through a filter on the
// event's date and anonymises the row; a list update moves, retires and creates speakers in one transaction. Both under
// the runtime role, so row-level security applies.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
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

const { deleteExternalSpeaker, retireExternalSpeaker } = await import('./external-speakers.server')
const { applySpeakerListUpdate } = await import('./apply-speaker-list-update.server')

const ts = Date.now()
let congregationId: number
let bagnolet: number
let pantin: number
let paul: number
let olivier: number
let pastPart: number
let futurePart: number

beforeAll(async () => {
  congregationId = (
    await testDb.congregation.create({ data: { name: `Speakers ${ts}`, slug: `speakers-${ts}`, active: true } })
  ).id
  await withScope(congregationId, async tx => {
    const author = await tx.userAccount.create({
      data: { email: `speakers-${ts}@test.com`, password: 'hashed', active: true, congregationId },
    })
    const template = await tx.eventTemplate.create({ data: { name: 'Week-end', key: `weekend-${ts}`, congregationId } })
    const congregation = (name: string) =>
      tx.speakerCongregation.create({ data: { name, nameNormalized: name.toLowerCase(), congregationId } })
    bagnolet = (await congregation('Bagnolet')).id
    pantin = (await congregation('Pantin')).id
    const speaker = (name: string, speakerCongregationId: number) =>
      tx.externalSpeaker.create({ data: { name, speakerCongregationId, phone: '06 00 00 00 00', congregationId } })
    paul = (await speaker('Paul LEROY', bagnolet)).id
    olivier = (await speaker('Olivier LAMBERT', pantin)).id
    const part = async (day: Date) => {
      const event = await tx.event.create({
        data: {
          name: 'Réunion',
          templateId: template.id,
          startDate: day,
          endDate: day,
          createdById: author.id,
          congregationId,
        },
      })
      return (await tx.eventPart.create({ data: { eventId: event.id, externalSpeakerId: paul, congregationId } })).id
    }
    const day = 24 * 60 * 60 * 1000
    pastPart = await part(new Date(Date.now() - 60 * day))
    futurePart = await part(new Date(Date.now() + 30 * day))
  })
})

afterAll(async () => {
  if (congregationId) {
    await withScope(congregationId, async tx => {
      await tx.eventPart.deleteMany({})
      await tx.event.deleteMany({})
      await tx.externalSpeaker.deleteMany({})
      await tx.speakerCongregation.deleteMany({})
      await tx.eventTemplate.deleteMany({})
      await tx.userAccount.deleteMany({})
    })
    await testDb.congregation.deleteMany({ where: { id: congregationId } })
  }
  await testDb.$disconnect()
})

describe('applySpeakerListUpdate', () => {
  it('moves a speaker in, creates a new one and saves the list’s date, all in one transaction', async () => {
    const fields = (name: string) => ({ name, phone: '06 11 11 11 11', phone2: '', email: '', email2: '', talks: [12] })
    const result = await withScope(congregationId, tx =>
      applySpeakerListUpdate(tx, congregationId, 1, {
        speakerCongregationId: bagnolet,
        listDate: new Date('2026-11-03T00:00:00Z'),
        contacts: {
          responsibleName: 'Paul LEROY',
          responsiblePhone: '',
          responsibleEmail: '',
          coordinatorName: 'Alain BRUNET',
          coordinatorPhone: '',
          coordinatorEmail: '',
        },
        rows: [
          { kind: 'move', speakerId: olivier, fields: fields('Olivier LAMBERT') },
          { kind: 'create', fields: fields('Arnaud PICARD') },
        ],
        file: null,
      }),
    )
    expect(result).toMatchObject({ created: 1, moved: 1 })

    const after = await withScope(congregationId, async tx => ({
      speakers: await tx.externalSpeaker.findMany({
        where: { speakerCongregationId: bagnolet },
        select: { name: true, congregationName: true, talks: true },
        orderBy: { name: 'asc' },
      }),
      congregation: await tx.speakerCongregation.findFirst({ where: { id: bagnolet } }),
    }))
    expect(after.speakers.map(s => s.name)).toEqual(['Arnaud PICARD', 'Olivier LAMBERT', 'Paul LEROY'])
    expect(after.speakers.find(s => s.name === 'Olivier LAMBERT')).toMatchObject({
      congregationName: 'Bagnolet',
      talks: [12],
    })
    expect(after.congregation).toMatchObject({
      coordinatorName: 'Alain BRUNET',
      listDate: new Date('2026-11-03T00:00:00Z'),
    })
  })
})

describe('deleteExternalSpeaker', () => {
  it('frees the planned talk, keeps the past one, and erases the speaker’s name and contact', async () => {
    await withScope(congregationId, tx => retireExternalSpeaker(tx, paul, congregationId, 1))
    const result = await withScope(congregationId, tx => deleteExternalSpeaker(tx, paul, congregationId, 1))

    expect(result).toEqual({ freedParts: 1, pastParts: 1 })
    const after = await withScope(congregationId, async tx => ({
      past: await tx.eventPart.findFirst({ where: { id: pastPart }, select: { externalSpeakerId: true } }),
      future: await tx.eventPart.findFirst({ where: { id: futurePart }, select: { externalSpeakerId: true } }),
      speaker: await tx.externalSpeaker.findFirst({
        where: { id: paul },
        select: { name: true, phone: true, anonymizedAt: true, speakerCongregationId: true },
      }),
    }))
    expect(after.past?.externalSpeakerId).toBe(paul)
    expect(after.future?.externalSpeakerId).toBeNull()
    expect(after.speaker).toMatchObject({ name: '', phone: null, speakerCongregationId: bagnolet })
    expect(after.speaker?.anonymizedAt).toBeInstanceOf(Date)
  })
})
