import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '~/database/generated/client'
import { EventTemplateKey } from '~/features/events/model/event-template.type'
import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'
import {
  setTemplatePartAllowedRoles,
  setTemplateServicePartAllowedRoles,
} from '~/features/events/server/allowed-roles.server'
import { writeAttendanceCount } from '~/features/events/server/attendance.aggregate'
import { createDayOff } from '~/features/events/server/days-off.server'
import { assignPart, assignServicePart } from '~/features/events/server/event-part-assignments.server'
import { releaseEvent } from '~/features/events/server/event-status.server'
import { setTemplateResponsible } from '~/features/events/server/event-templates.server'
import { createExternalSpeaker } from '~/features/events/server/external-speakers.server'
import { createProgrammeOnDay, createProgrammeSeries } from '~/features/events/server/programme-creation.server'
import { extendRecurringEvents } from '~/features/events/server/recurring-events.server'
import { seedDefaultTemplates } from '~/features/events/server/seed-templates.server'
import { createDirect } from '~/features/publishers/server/member.aggregate'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import { seedCongregationDefaults, seedPermissions } from '~/shared/domain/setup.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { combineLocalDateTime } from '~/shared/utils/event-time'
import { compareText } from '~/tests/fixtures/reference-normalise'

// The congregation every reference test reads: programmes published and draft, services, parts with an assistant and
// an external speaker, allowed roles, an absence that conflicts, responsibles of both scopes, the meetings created
// ahead, attendance counts and the board's programme documents. Built through the app's service functions wherever
// one exists; the congregation, its accounts and its board rows are written directly.
//
// It must be built with `Date` faked to REFERENCE_NOW: series creation reads the clock to fill the days before it.
// Nothing here is random — names, days and the order of every write are fixed — and the tests compare what the readers
// return, with ids turned into these labels, to committed reference files.

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
  { key: 'marc', firstname: 'Marc', lastname: 'PETIT', isMale: true, isServant: true, account: true },
  { key: 'pierre', firstname: 'Pierre', lastname: 'MOREAU', isMale: true, account: true },
  { key: 'hugo', firstname: 'Hugo', lastname: 'LEROY', isMale: true, account: true },
  { key: 'marie', firstname: 'Marie', lastname: 'DUBOIS', isMale: false, account: true },
  { key: 'claire', firstname: 'Claire', lastname: 'FAURE', isMale: false },
]

/** Who holds each service in a filled week, by the service's name: never by the order the database returns them. */
const SERVANTS: Record<string, string> = {
  'Audio-vidéo': 'luc',
  Estrade: 'marc',
  'Préposés à l’accueil': 'pierre',
  Nettoyage: 'paul',
}

export interface ReferenceCongregation {
  congregationId: number
  adminId: number
  speakerId: number
  /** The fixture's label for each id it wrote, keyed `table:id`: what the normalisers write in an id's place. */
  labels: Map<string, string>
  /** An event's id by its label (`midweek-2`, `weekend-ahead-1`); throws for a label the fixture never wrote. */
  event(name: string): number
  member(key: string): number
  account(key: string): number
  template(key: 'midweek' | 'weekend' | 'memorial'): number
  document(name: string): number
  /** Every member, by key. */
  members(): [string, number][]
}

/** Reads a label's id back, failing loudly on a typo rather than reading `undefined` — which Prisma drops from a filter. */
function lookup(byName: Map<string, number>, table: string) {
  return (name: string): number => {
    const id = byName.get(name)
    if (id == null) throw new Error(`the reference fixture has no ${table} « ${name} »`)
    return id
  }
}

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
  const ids = new Map<string, Map<string, number>>()
  const label = (table: string, id: number, name: string) => {
    labels.set(`${table}:${id}`, name)
    if (!ids.has(table)) ids.set(table, new Map())
    ids.get(table)?.set(name, id)
  }

  const admin = await withScope(congregationId, async db => {
    await seedCongregationDefaults(db, congregationId, 'fr', seedDefaultTemplates)
    return db.userAccount.create({
      data: { email: `admin-${suffix}@reference.test`, password: 'x', active: true, congregationId },
    })
  })
  const adminId = admin.id
  label('account', adminId, 'admin')

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
        label('account', account.id, person.key)
      }
    }
  })
  const member = lookup(ids.get('member') ?? new Map(), 'member')
  const account = lookup(ids.get('account') ?? new Map(), 'account')

  const templates = await withScope(congregationId, async db => {
    await labelSeededRows(db, congregationId, label)
    const template = lookup(ids.get('template') ?? new Map(), 'template')
    const role = lookup(ids.get('role') ?? new Map(), 'role')
    const midweek = template('midweek')
    const weekend = template('weekend')

    // Allowed roles: the midweek talk to elders, the weekend sound to elders and servants.
    const talk = await db.templatePart.findFirstOrThrow({
      where: { templateId: midweek, congregationId, allowExternalSpeaker: true },
      orderBy: { order: 'asc' },
      select: { id: true },
    })
    const talkRoles = await setTemplatePartAllowedRoles(db, talk.id, 'speaker', [role('elder')], congregationId)
    if (talkRoles.added.length !== 1) throw new Error('the fixture could not restrict the midweek talk to elders')
    const sound = await db.templateServicePart.findFirstOrThrow({
      where: { templateId: weekend, key: 'sono', congregationId },
      select: { id: true },
    })
    const soundRoles = await setTemplateServicePartAllowedRoles(
      db,
      sound.id,
      [role('elder'), role('assistant-servant')],
      congregationId,
    )
    if (soundRoles.added.length !== 2) throw new Error('the fixture could not restrict the weekend sound')

    // Responsibles of both scopes: elders for the midweek programme, servants for the weekend services.
    await setTemplateResponsible(db, midweek, role('elder'), congregationId, ResponsibilityScope.Programme)
    await setTemplateResponsible(db, weekend, role('assistant-servant'), congregationId, ResponsibilityScope.Service)
    return template
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
  await withScope(congregationId, async db => {
    // Three weeks of programmes, from Monday 8 March.
    const series = await createProgrammeSeries(
      db,
      { templateIds: [templates('midweek'), templates('weekend')], from: '2027-03-08', to: '2027-03-28' },
      ctx,
    )
    if (series.created.length !== 6 || series.existing !== 0) {
      throw new Error(`the fixture expected 6 new programmes, the series made ${series.created.length}`)
    }
    await createProgrammeOnDay(db, { templateId: templates('memorial'), day: '2027-03-22' }, ctx)
    // The empty meetings created ahead: the one the series fills in before its first day, then the daily job's, two
    // months past today.
    const created = await extendRecurringEvents(db, {
      congregationId,
      timeZone: REFERENCE_TIMEZONE,
      now: REFERENCE_NOW,
    })
    if (created === 0) throw new Error('the fixture expected the recurring job to create meetings ahead')

    const names = new Map<number | null, string>([
      [templates('midweek'), 'midweek'],
      [templates('weekend'), 'weekend'],
      [templates('memorial'), 'memorial'],
    ])
    const all = await db.event.findMany({
      where: { congregationId },
      select: { id: true, templateId: true, origin: true },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    })
    const counters: Record<string, number> = {}
    for (const event of all) {
      const name = names.get(event.templateId)
      if (!name) throw new Error(`the fixture did not expect an event of template ${event.templateId}`)
      const prefix = event.origin === 'job' ? `${name}-ahead` : name
      counters[prefix] = (counters[prefix] ?? 0) + 1
      label('event', event.id, `${prefix}-${counters[prefix]}`)
    }
  })
  const event = lookup(ids.get('event') ?? new Map(), 'event')

  // An absence for Hugo over the second midweek meeting.
  await withScope(congregationId, async db => {
    const absence = await createDayOff(
      db,
      account('hugo'),
      member('hugo'),
      combineLocalDateTime('2027-03-15', '00:00', REFERENCE_TIMEZONE),
      combineLocalDateTime('2027-03-17', '23:59', REFERENCE_TIMEZONE),
      congregationId,
    )
    if (absence == null) throw new Error('the fixture could not create Hugo’s absence')
  })

  // Week 1 filled and published; week 2 filled, with Hugo on his absence, left a draft.
  const people =
    (override: Record<string, string> = {}) =>
    (key: string) =>
      member(override[key] ?? key)
  await fillWeek(congregationId, event('midweek-1'), event('weekend-1'), people(), speakerId)
  await fillWeek(congregationId, event('midweek-2'), event('weekend-2'), people({ pierre: 'hugo' }), null)
  await withScope(congregationId, async db => {
    for (const name of ['midweek-1', 'weekend-1']) {
      const result = await releaseEvent(db, event(name), congregationId, adminId)
      if (!result || 'error' in result) {
        throw new Error(`the fixture could not publish ${name}: ${result ? result.error : 'not found'}`)
      }
    }
  })

  // Attendance counted on the first week and the Memorial, as a corrector enters it.
  await withScope(congregationId, async db => {
    const counts: [string, number, number][] = [
      ['midweek-1', 84, 12],
      ['weekend-1', 101, 9],
      ['memorial-1', 163, 21],
    ]
    for (const [name, inPerson, online] of counts) {
      for (const [count, value] of [
        ['inPerson', inPerson],
        ['online', online],
      ] as const) {
        await writeAttendanceCount(db, {
          congregationId,
          actorId: adminId,
          eventId: event(name),
          count,
          value,
          canRecord: false,
          canCorrect: true,
          timeZone: REFERENCE_TIMEZONE,
          now: REFERENCE_NOW,
        })
      }
    }
  })

  await withScope(congregationId, async db => {
    const section = await db.boardSection.create({ data: { name: 'Réunions', order: 1, congregationId } })
    label('section', section.id, 'meetings')
    const both = [
      { templateId: templates('midweek'), parts: true, services: true },
      { templateId: templates('weekend'), parts: true, services: true },
    ]
    const specs: [string, unknown, boolean][] = [
      ['by-date', { templates: both, groupBy: 'date' }, true],
      ['by-template', { templates: both, groupBy: 'template' }, true],
      ['midweek-parts', { templates: [{ templateId: templates('midweek'), parts: true, services: false }] }, false],
      ['weekend-services', { templates: [{ templateId: templates('weekend'), parts: false, services: true }] }, true],
    ]
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
      label('document', document.id, name)
    }
  })

  const fixture: ReferenceCongregation = {
    congregationId,
    adminId,
    speakerId,
    labels,
    event,
    member,
    account,
    template: templates,
    document: lookup(ids.get('document') ?? new Map(), 'document'),
    members: () => [...(ids.get('member') ?? new Map())].sort(([a], [b]) => compareText(a, b)),
  }
  await labelItems(fixture)
  return fixture
}

type Label = (table: string, id: number, name: string) => void

/** Labels what congregation seeding wrote: roles and presets by key, templates and their parts and services. */
async function labelSeededRows(db: TransactionClient, congregationId: number, label: Label) {
  for (const role of await db.role.findMany({ where: { congregationId }, select: { id: true, key: true } })) {
    label('role', role.id, role.key)
  }
  for (const preset of await db.partPreset.findMany({ where: { congregationId }, select: { id: true, key: true } })) {
    label('preset', preset.id, preset.key)
  }
  const byKey = new Map<string, string>([
    [EventTemplateKey.MidweekMeeting, 'midweek'],
    [EventTemplateKey.WeekendMeeting, 'weekend'],
    [EventTemplateKey.Memorial, 'memorial'],
    [EventTemplateKey.DayOff, 'day-off'],
    [EventTemplateKey.Freeform, 'freeform'],
  ])
  const all = await db.eventTemplate.findMany({
    where: { congregationId },
    include: { parts: { select: { id: true, order: true } }, serviceParts: { select: { id: true, key: true } } },
  })
  for (const template of all) {
    const name = byKey.get(template.key)
    if (!name) throw new Error(`the reference fixture does not know the seeded template « ${template.key} »`)
    label('template', template.id, name)
    for (const part of template.parts) label('templatePart', part.id, `${name}/part-${part.order}`)
    for (const service of template.serviceParts)
      label('templateServicePart', service.id, `${name}/service-${service.key}`)
  }
}

/**
 * Assigns every part and service of a week: the parts in turn to the brothers, the weekend talk to the external
 * speaker when there is one, a reader on the closing part; each service to its servant.
 */
async function fillWeek(
  congregationId: number,
  midweekId: number,
  weekendId: number,
  person: (key: string) => number,
  speakerId: number | null,
) {
  await withScope(congregationId, async db => {
    await fillParts(db, congregationId, midweekId, person, null)
    await fillParts(db, congregationId, weekendId, person, speakerId)
    await fillServices(db, congregationId, midweekId, person)
    await fillServices(db, congregationId, weekendId, person)
  })
}

async function fillParts(
  db: TransactionClient,
  congregationId: number,
  eventId: number,
  person: (key: string) => number,
  speakerId: number | null,
) {
  const speakers = ['paul', 'jean', 'luc', 'pierre'].map(person)
  const parts = await db.eventPart.findMany({
    where: { eventId, congregationId },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
    select: { id: true, allowExternalSpeaker: true },
  })
  if (parts.length === 0) throw new Error(`the fixture found no part on event ${eventId}`)
  for (const [index, part] of parts.entries()) {
    const slot = slotFor(index, parts.length, part.allowExternalSpeaker ? speakerId : null, speakers, person)
    const result = await assignPart(
      db,
      part.id,
      slot.speaker,
      slot.assistant,
      slot.externalSpeakerId,
      slot.topic,
      congregationId,
    )
    if ('error' in result) throw new Error(`the fixture could not assign part ${part.id}: ${result.error}`)
  }
}

/**
 * Who takes the part at `index`: the external speaker on the talk he may give, else the brothers in turn — the second
 * part is the talk, which Paul gives — with Marc reading on the closing part.
 */
function slotFor(
  index: number,
  count: number,
  externalSpeakerId: number | null,
  speakers: number[],
  person: (key: string) => number,
) {
  const external = externalSpeakerId != null
  return {
    speaker: external ? null : index === 1 ? person('paul') : speakers[index % speakers.length],
    assistant: !external && index === count - 1 ? person('marc') : null,
    externalSpeakerId,
    topic: index === 1 ? 'Sujet de référence' : '',
  }
}

async function fillServices(
  db: TransactionClient,
  congregationId: number,
  eventId: number,
  person: (key: string) => number,
) {
  const services = await db.eventServicePart.findMany({
    where: { eventId, congregationId },
    select: { id: true, name: true },
  })
  if (services.length === 0) throw new Error(`the fixture found no service on event ${eventId}`)
  for (const service of services) {
    const servant = SERVANTS[service.name]
    if (!servant) throw new Error(`the fixture has no servant for « ${service.name} »`)
    const result = await assignServicePart(db, service.id, person(servant), congregationId)
    if ('error' in result) throw new Error(`the fixture could not assign service ${service.id}: ${result.error}`)
  }
}

/**
 * Labels every part and service of the fixture's events: its meeting's label and its order for a part
 * (`midweek-2/part-3`), its name for a service (`midweek-2/service-Audio-vidéo`).
 */
async function labelItems(fixture: ReferenceCongregation) {
  const { congregationId, labels } = fixture
  const event = (id: number) => {
    const name = labels.get(`event:${id}`)
    if (!name) throw new Error(`the reference fixture has no label for event ${id}`)
    return name
  }
  await withScope(congregationId, async db => {
    const parts = await db.eventPart.findMany({
      where: { congregationId },
      select: { id: true, eventId: true, order: true },
    })
    for (const part of parts) labels.set(`eventPart:${part.id}`, `${event(part.eventId)}/part-${part.order}`)
    const services = await db.eventServicePart.findMany({
      where: { congregationId },
      select: { id: true, eventId: true, name: true },
    })
    for (const service of services)
      labels.set(`eventServicePart:${service.id}`, `${event(service.eventId)}/service-${service.name}`)
  })
}

/** A label by table and id, failing loudly when the fixture never labelled it. */
export function labelOf(fixture: ReferenceCongregation, table: string, id: number): string {
  const name = fixture.labels.get(`${table}:${id}`)
  if (!name) throw new Error(`the reference fixture has no label for ${table} ${id}`)
  return name
}

/** A map or record keyed by ids, as an object keyed by the fixture's labels for that table, sorted by label. */
export function byLabel<V>(
  fixture: ReferenceCongregation,
  table: string,
  entries: Map<number, V> | Record<number, V>,
): Record<string, V> {
  const pairs = entries instanceof Map ? [...entries] : Object.entries(entries).map(([k, v]) => [Number(k), v] as const)
  return Object.fromEntries(
    pairs.map(([id, value]) => [labelOf(fixture, table, id), value] as const).sort(([a], [b]) => compareText(a, b)),
  )
}

/**
 * Deletes everything the fixture wrote, children before parents, then the congregation itself — also what an import
 * into an empty congregation wrote, which the archive suite cleans with it.
 */
export async function deleteReferenceCongregation(congregationId: number) {
  await withScope(congregationId, async db => {
    const where = { congregationId }
    await db.notificationEvent.deleteMany({ where })
    await db.boardDynamicDocumentView.deleteMany({ where: { settings: { congregationId } } })
    await db.boardDynamicDocumentSettings.deleteMany({ where })
    await db.boardSectionVisibilityRole.deleteMany({ where })
    await db.boardSection.deleteMany({ where })
    await db.absence.deleteMany({ where })
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
    await db.speakerCongregation.deleteMany({ where })
    await db.setting.deleteMany({ where })
    await db.memberRoleAssignment.deleteMany({ where })
    await db.userRoleAssignment.deleteMany({ where })
    await db.rolePermission.deleteMany({ where })
    await db.role.deleteMany({ where })
    await db.consentRecord.deleteMany({ where })
    await db.member.updateMany({ where, data: { publisherGroupId: null } })
    await db.publisherGroup.deleteMany({ where })
    await db.userAccount.deleteMany({ where })
    await db.member.deleteMany({ where })
    // Audit writes are fire-and-forget: drain them first, or one lands after the delete and holds the congregation.
    await flushPendingAuditWrites()
    await db.auditLog.deleteMany({ where })
  })
  const deleted = await referenceDb.congregation.deleteMany({ where: { id: congregationId } })
  if (deleted.count !== 1) throw new Error(`the reference congregation ${congregationId} was not deleted`)
}
