import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '~/database/generated/client'
import { EventTemplateKey } from '~/features/events/model/event-template.type'
import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'
import {
  setTemplatePartAllowedRoles,
  setTemplateServicePartAllowedRoles,
} from '~/features/events/server/allowed-roles.server'
import { createDayOff } from '~/features/events/server/days-off.server'
import { assignPart, assignServicePart } from '~/features/events/server/event-part-assignments.server'
import { releaseEvent } from '~/features/events/server/event-status.server'
import { setTemplateResponsible } from '~/features/events/server/event-templates.server'
import { createExternalSpeaker } from '~/features/events/server/external-speakers.server'
import { createProgrammeOnDay, createProgrammeSeries } from '~/features/events/server/programme-creation.server'
import { extendRecurringEvents } from '~/features/events/server/recurring-events.server'
import { seedDefaultTemplates } from '~/features/events/server/seed-templates.server'
import { createDirect } from '~/features/publishers/server/member.aggregate'
import { seedCongregationDefaults, seedPermissions } from '~/shared/domain/setup.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { combineLocalDateTime } from '~/shared/utils/event-time'

// The congregation every reference test reads: programmes published and draft, services, parts with an assistant and
// an external speaker, allowed roles, an absence that conflicts, responsibles of both scopes, the meetings created
// ahead, and the board's programme documents. Built only through the service functions the app uses, on a fixed
// clock, so what the readers return today is what they must return after the schedules refactor.
//
// Nothing here is random: names, days and the order of every write are fixed, and the tests compare what the readers
// return — never ids or creation timestamps — to committed reference files.

/** The moment every reference test runs at: a Wednesday morning, the week before the first programmes. */
export const REFERENCE_NOW = new Date('2027-03-03T09:00:00Z')
export const REFERENCE_TIMEZONE = 'Europe/Paris'

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 4,
  connectionTimeoutMillis: 5000,
})
export const referenceDb = new PrismaClient({ adapter })

export function withScope<T>(congregationId: number, fn: (db: TransactionClient) => Promise<T>): Promise<T> {
  return referenceDb.$transaction(
    async tx => {
      await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
      return fn(tx as unknown as TransactionClient)
    },
    { timeout: 60_000 },
  )
}

interface PersonSpec {
  key: string
  firstname: string
  lastname: string
  isMale: boolean
  isHelder?: boolean
  isServant?: boolean
  account?: boolean
}

const PEOPLE: PersonSpec[] = [
  { key: 'paul', firstname: 'Paul', lastname: 'MARTIN', isMale: true, isHelder: true, account: true },
  { key: 'jean', firstname: 'Jean', lastname: 'DURAND', isMale: true, isHelder: true, account: true },
  { key: 'luc', firstname: 'Luc', lastname: 'BERNARD', isMale: true, isServant: true, account: true },
  { key: 'marc', firstname: 'Marc', lastname: 'PETIT', isMale: true, isServant: true },
  { key: 'pierre', firstname: 'Pierre', lastname: 'MOREAU', isMale: true, account: true },
  { key: 'hugo', firstname: 'Hugo', lastname: 'LEROY', isMale: true, account: true },
  { key: 'marie', firstname: 'Marie', lastname: 'DUBOIS', isMale: false, account: true },
  { key: 'claire', firstname: 'Claire', lastname: 'FAURE', isMale: false },
]

export interface ReferenceCongregation {
  congregationId: number
  adminId: number
  members: Record<string, number>
  accounts: Record<string, number>
  templates: { midweek: number; weekend: number; memorial: number }
  /** The programmes by name, e.g. `midweek-1` for the first week's midweek meeting. */
  events: Record<string, number>
  speakerId: number
  /** The board's programme documents by name. */
  documents: Record<string, number>
  /** Every id the fixture wrote, by table and label: what the normalisers turn back into labels. */
  labels: Map<string, string>
}

/** The four weeks of programmes, Monday to Sunday. */
const WEEKS = ['2027-03-08', '2027-03-15', '2027-03-22', '2027-03-29']

export async function buildReferenceCongregation(suffix: string): Promise<ReferenceCongregation> {
  await seedPermissions(referenceDb)
  const congregation = await referenceDb.congregation.create({
    data: {
      name: 'Assemblée de référence',
      slug: `events-reference-${suffix}`,
      active: true,
      locale: 'fr',
      timezone: REFERENCE_TIMEZONE,
    },
  })
  const congregationId = congregation.id
  const labels = new Map<string, string>()
  const label = (table: string, id: number, name: string) => labels.set(`${table}:${id}`, name)

  const admin = await withScope(congregationId, async db => {
    await seedCongregationDefaults(db, congregationId, 'fr', seedDefaultTemplates)
    return db.userAccount.create({
      data: { email: `admin-${suffix}@reference.test`, password: 'x', active: true, congregationId },
    })
  })
  const adminId = admin.id
  label('account', adminId, 'admin')

  const members: Record<string, number> = {}
  const accounts: Record<string, number> = {}
  await withScope(congregationId, async db => {
    for (const person of PEOPLE) {
      const member = await createDirect(db, congregationId, adminId, {
        firstname: person.firstname,
        lastname: person.lastname,
        isMale: person.isMale,
        birthDate: new Date('1980-01-01'),
        baptismDate: new Date('2000-01-01'),
        isPublisher: true,
        isHelder: person.isHelder ?? false,
        isServant: person.isServant ?? false,
        isAnointed: false,
        publisherGroupId: null,
        phone: '',
        address: '',
      })
      members[person.key] = member.id
      label('member', member.id, person.key)
      if (person.account) {
        const account = await db.userAccount.create({
          data: {
            email: `${person.key}-${suffix}@reference.test`,
            password: 'x',
            active: true,
            memberId: member.id,
            congregationId,
          },
        })
        accounts[person.key] = account.id
        label('account', account.id, person.key)
      }
    }
  })

  const templates = await withScope(congregationId, async db => {
    const byKey = async (key: string) =>
      (await db.eventTemplate.findFirstOrThrow({ where: { key, congregationId }, select: { id: true } })).id
    const midweek = await byKey(EventTemplateKey.MidweekMeeting)
    const weekend = await byKey(EventTemplateKey.WeekendMeeting)
    const memorial = await byKey(EventTemplateKey.Memorial)
    label('template', midweek, 'midweek')
    label('template', weekend, 'weekend')
    label('template', memorial, 'memorial')

    const role = async (key: string) =>
      (await db.role.findFirstOrThrow({ where: { key, congregationId }, select: { id: true } })).id
    const elder = await role('elder')
    const servant = await role('assistant-servant')

    // Allowed roles: the midweek talk to elders, the weekend sound to elders and servants.
    const talk = await db.templatePart.findFirstOrThrow({
      where: { templateId: midweek, congregationId, allowExternalSpeaker: true },
      orderBy: { order: 'asc' },
      select: { id: true },
    })
    await setTemplatePartAllowedRoles(db, talk.id, 'speaker', [elder], congregationId)
    const sound = await db.templateServicePart.findFirstOrThrow({
      where: { templateId: weekend, key: 'sono', congregationId },
      select: { id: true },
    })
    await setTemplateServicePartAllowedRoles(db, sound.id, [elder, servant], congregationId)

    // Responsibles of both scopes: elders for the midweek programme, servants for the weekend services.
    await setTemplateResponsible(db, midweek, elder, congregationId, ResponsibilityScope.Programme)
    await setTemplateResponsible(db, weekend, servant, congregationId, ResponsibilityScope.Service)
    return { midweek, weekend, memorial }
  })

  const speakerId = await withScope(congregationId, async db => {
    const speaker = await createExternalSpeaker(db, congregationId, adminId, {
      name: 'Antoine ROUSSEAU',
      speakerCongregationId: null,
      phone: '',
      phone2: '',
      email: '',
      email2: '',
      talks: [12],
      notes: '',
    })
    return speaker.id
  })
  label('speaker', speakerId, 'rousseau')

  const ctx = { congregationId, timezone: REFERENCE_TIMEZONE, actorId: adminId }
  const events: Record<string, number> = {}
  await withScope(congregationId, async db => {
    await createProgrammeSeries(
      db,
      { templateIds: [templates.midweek, templates.weekend], from: WEEKS[0], to: '2027-03-28' },
      ctx,
    )
    await createProgrammeOnDay(db, { templateId: templates.memorial, day: '2027-03-22' }, ctx)
    // The meetings created ahead, past the programmes, as the daily job keeps them.
    await extendRecurringEvents(db, { congregationId, timeZone: REFERENCE_TIMEZONE, now: REFERENCE_NOW })

    const all = await db.event.findMany({
      where: { congregationId },
      select: { id: true, templateId: true, startDate: true, createdById: true },
      orderBy: { startDate: 'asc' },
    })
    const names = new Map<number | null, string>([
      [templates.midweek, 'midweek'],
      [templates.weekend, 'weekend'],
      [templates.memorial, 'memorial'],
    ])
    const counters: Record<string, number> = {}
    for (const event of all) {
      const name = names.get(event.templateId) ?? 'other'
      const prefix = event.createdById == null ? `${name}-ahead` : name
      counters[prefix] = (counters[prefix] ?? 0) + 1
      events[`${prefix}-${counters[prefix]}`] = event.id
      label('event', event.id, `${prefix}-${counters[prefix]}`)
    }
  })

  // An absence for Hugo over the second midweek meeting.
  await withScope(congregationId, async db => {
    await createDayOff(
      db,
      accounts.hugo,
      members.hugo,
      combineLocalDateTime('2027-03-15', '00:00', REFERENCE_TIMEZONE),
      combineLocalDateTime('2027-03-17', '23:59', REFERENCE_TIMEZONE),
      congregationId,
    )
  })

  // Week 1 filled and published; week 2 filled, with Hugo on his absence, left a draft.
  await fillWeek(congregationId, events['midweek-1'], events['weekend-1'], members, speakerId)
  await fillWeek(congregationId, events['midweek-2'], events['weekend-2'], { ...members, pierre: members.hugo }, null)
  await withScope(congregationId, async db => {
    for (const name of ['midweek-1', 'weekend-1']) {
      const result = await releaseEvent(db, events[name], congregationId, adminId)
      if (!result || 'error' in result) throw new Error(`the fixture could not publish ${name}`)
    }
  })

  const documents = await withScope(congregationId, async db => {
    const section = await db.boardSection.create({ data: { name: 'Réunions', order: 1, congregationId } })
    const both = [
      { templateId: templates.midweek, parts: true, services: true },
      { templateId: templates.weekend, parts: true, services: true },
    ]
    const specs: [string, unknown, boolean][] = [
      ['by-date', { templates: both, groupBy: 'date' }, true],
      ['by-template', { templates: both, groupBy: 'template' }, true],
      ['midweek-parts', { templates: [{ templateId: templates.midweek, parts: true, services: false }] }, false],
      ['weekend-services', { templates: [{ templateId: templates.weekend, parts: false, services: true }] }, true],
    ]
    const ids: Record<string, number> = {}
    for (const [index, [name, dynamicConfig, showServices]] of specs.entries()) {
      const document = await db.boardDynamicDocumentSettings.create({
        data: {
          title: `Programme ${name}`,
          dynamicType: 'programme',
          dynamicConfig: dynamicConfig as object,
          showServices,
          sectionId: section.id,
          order: index + 1,
          congregationId,
        },
      })
      ids[name] = document.id
      label('document', document.id, name)
    }
    return ids
  })

  return { congregationId, adminId, members, accounts, templates, events, speakerId, documents, labels }
}

/**
 * Assigns every part and service of a week: the parts in turn to the brothers, the weekend talk to the external
 * speaker when there is one, a reader on the closing part.
 */
async function fillWeek(
  congregationId: number,
  midweekId: number,
  weekendId: number,
  members: Record<string, number>,
  speakerId: number | null,
) {
  await withScope(congregationId, async db => {
    await fillParts(db, congregationId, midweekId, members, null)
    await fillParts(db, congregationId, weekendId, members, speakerId)
    await fillServices(db, congregationId, midweekId, members)
    await fillServices(db, congregationId, weekendId, members)
  })
}

async function fillParts(
  db: TransactionClient,
  congregationId: number,
  eventId: number,
  members: Record<string, number>,
  speakerId: number | null,
) {
  const speakers = [members.paul, members.jean, members.luc, members.pierre]
  const parts = await db.eventPart.findMany({
    where: { eventId, congregationId },
    orderBy: { order: 'asc' },
    select: { id: true, allowExternalSpeaker: true },
  })
  for (const [index, part] of parts.entries()) {
    const external = part.allowExternalSpeaker && speakerId != null
    // The second part is the talk, for elders on a midweek meeting: Paul gives it.
    const speaker = index === 1 ? members.paul : speakers[index % speakers.length]
    const assistant = !external && index === parts.length - 1 ? members.marc : null
    const result = await assignPart(
      db,
      part.id,
      external ? null : speaker,
      assistant,
      external ? speakerId : null,
      index === 1 ? 'Sujet de référence' : '',
      congregationId,
    )
    if ('error' in result) throw new Error(`the fixture could not assign part ${part.id}: ${result.error}`)
  }
}

async function fillServices(
  db: TransactionClient,
  congregationId: number,
  eventId: number,
  members: Record<string, number>,
) {
  const servants = [members.luc, members.marc, members.pierre, members.paul]
  const services = await db.eventServicePart.findMany({
    where: { eventId, congregationId },
    orderBy: { id: 'asc' },
    select: { id: true },
  })
  for (const [index, service] of services.entries()) {
    const result = await assignServicePart(db, service.id, servants[index % servants.length], congregationId)
    if ('error' in result) throw new Error(`the fixture could not assign service ${service.id}: ${result.error}`)
  }
}

/** Deletes everything the fixture wrote, children first; the congregation's built-in rows go with it. */
export async function deleteReferenceCongregation(congregationId: number) {
  await withScope(congregationId, async db => {
    const where = { congregationId }
    await db.notificationEvent.deleteMany({ where })
    await db.auditLog.deleteMany({ where })
    await db.boardDynamicDocumentView.deleteMany({ where: { settings: { congregationId } } })
    await db.boardDynamicDocumentSettings.deleteMany({ where })
    await db.boardSection.deleteMany({ where })
    await db.attendance.deleteMany({ where })
    await db.eventServicePartAllowedRole.deleteMany({ where })
    await db.eventPartAllowedRole.deleteMany({ where })
    await db.eventServicePart.deleteMany({ where })
    await db.eventPart.deleteMany({ where })
    await db.event.deleteMany({ where })
    await db.templateServicePartAllowedRole.deleteMany({ where })
    await db.templatePartAllowedRole.deleteMany({ where })
    await db.templateResponsible.deleteMany({ where })
    await db.templateServicePart.deleteMany({ where })
    await db.templatePart.deleteMany({ where })
    await db.eventTemplate.deleteMany({ where })
    await db.partPreset.deleteMany({ where })
    await db.externalSpeaker.deleteMany({ where })
  })
}
