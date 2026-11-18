import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// An absence is an event of the « day-off » template, published as soon as it is declared. The board's programme must
// never show one: the programme form does not offer that template, and a document whose configuration names it —
// every template was ticked by default — reads past its absences.

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

const { getContentVersion, getDynamicDocumentData, getDynamicPreview } = await import('./dynamic-documents.server')
const { loadDynamicForm } = await import('./dynamic-form.queries')

const ts = Date.now()
const ids = { cong: 0, account: 0, meetingTemplate: 0, dayOffTemplate: 0 }
// Ahead of today, so every reader — the screen from this month on, the preview from now on — would see them.
const MEETING_DAY = new Date(Date.now() + 10 * 86_400_000)
const ABSENCE_DAY = new Date(Date.now() + 3 * 86_400_000)

beforeAll(async () => {
  ids.cong = (
    await testDb.congregation.create({ data: { name: `Absences ${ts}`, slug: `absences-${ts}`, active: true } })
  ).id
  await withScope(ids.cong, async tx => {
    const congregationId = ids.cong
    ids.account = (
      await tx.userAccount.create({ data: { email: `absences-${ts}@test.com`, password: 'x', congregationId } })
    ).id
    ids.meetingTemplate = (
      await tx.eventTemplate.create({ data: { name: 'Réunion de semaine', key: 'midweek-meeting', congregationId } })
    ).id
    ids.dayOffTemplate = (
      await tx.eventTemplate.create({ data: { name: 'Absence', key: 'day-off', weekDay: null, congregationId } })
    ).id
    await tx.event.create({
      data: {
        name: 'Réunion de semaine',
        startDate: MEETING_DAY,
        endDate: MEETING_DAY,
        status: 'released',
        templateId: ids.meetingTemplate,
        createdById: ids.account,
        congregationId,
      },
    })
    await tx.event.create({
      data: {
        name: 'Absence',
        startDate: ABSENCE_DAY,
        endDate: ABSENCE_DAY,
        status: 'released',
        templateId: ids.dayOffTemplate,
        createdById: ids.account,
        congregationId,
      },
    })
  })
})

afterAll(async () => {
  if (ids.cong) {
    await withScope(ids.cong, async tx => {
      await tx.event.deleteMany({})
      await tx.eventTemplate.deleteMany({})
      await tx.userAccount.deleteMany({})
    })
    await testDb.congregation.deleteMany({ where: { id: ids.cong } })
  }
  await testDb.$disconnect()
})

/** A configuration naming both templates, as the form ticked every template by default. */
function everyTemplate() {
  return {
    templates: [
      { templateId: ids.meetingTemplate, parts: true, services: true },
      { templateId: ids.dayOffTemplate, parts: true, services: true },
    ],
    groupBy: 'date',
  }
}

describe('the board programme and absences', () => {
  it('does not offer the absence template in the programme form, nor tick it by default', async () => {
    const form = await withScope(ids.cong, tx =>
      loadDynamicForm(tx, {
        congregationId: ids.cong,
        now: new Date(),
        document: { type: 'programme', ref: null, title: 'Programme' },
      }),
    )

    const offered = (form?.templates ?? []).map(template => template.id)
    expect(offered).toContain(ids.meetingTemplate)
    expect(offered).not.toContain(ids.dayOffTemplate)
    expect(JSON.stringify(form?.document.dynamicConfig)).not.toContain(`"templateId":${ids.dayOffTemplate}`)
  })

  it('reads past the absences of a document whose configuration names their template', async () => {
    const data = await withScope(ids.cong, tx =>
      getDynamicDocumentData(tx, 'programme', null, ids.cong, { showServices: true, dynamicConfig: everyTemplate() }),
    )

    const events = data && 'events' in data ? (data.events ?? []) : []
    expect(events.map(event => event.name)).toEqual(['Réunion de semaine'])
  })

  it('previews the next meeting, not the next absence', async () => {
    const preview = await withScope(ids.cong, tx => getDynamicPreview(tx, 'programme', null, ids.cong, everyTemplate()))
    const absenceOnly = await withScope(ids.cong, tx =>
      getDynamicPreview(tx, 'programme', null, ids.cong, {
        templates: [{ templateId: ids.dayOffTemplate, parts: true, services: true }],
        groupBy: 'date',
      }),
    )

    expect(preview).not.toBeNull()
    expect(absenceOnly).toBeNull()
  })

  it('does not count an absence as a change of the document', async () => {
    const version = await withScope(ids.cong, tx =>
      getContentVersion(tx, 'programme', null, ids.cong, {
        templates: [{ templateId: ids.dayOffTemplate, parts: true, services: true }],
        groupBy: 'date',
      }),
    )

    expect(version).toBeNull()
  })

  it('shows nothing for an older document whose single template is the absence one', async () => {
    const data = await withScope(ids.cong, tx => getDynamicDocumentData(tx, 'programme', 'day-off', ids.cong, {}))

    const events = data && 'events' in data ? (data.events ?? []) : []
    expect(events).toEqual([])
  })
})
