import { randomUUID } from 'node:crypto'
import JsZip from 'jszip'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getDynamicDocumentData } from '~/features/display-board/server/dynamic-documents.server'
import { EntityIdMap } from '~/features/settings/server/data-transfer.type'
import {
  buildReferenceCongregation,
  deleteReferenceCongregation,
  REFERENCE_NOW,
  REFERENCE_TIMEZONE,
  type ReferenceCongregation,
  referenceDb,
  withScope,
} from '~/tests/fixtures/events-reference'
import { compareText, normalise, reference } from '~/tests/fixtures/reference-normalise'

// The congregation exported, then imported into a new, empty one (as the data-transfer round trip does): what the
// archive carries for meetings, and what the new congregation reads after the import, with its ids labelled as the
// fixture's so both references say who holds what — statuses, programmes and board documents included.

vi.setConfig({ testTimeout: 180_000, hookTimeout: 240_000 })

const IMPORTED_LOGIN = /^imported-/
const MATCHED_FULLY = new Set(['member', 'template', 'event', 'eventPart', 'eventServicePart'])

/** The archive files about meetings: what the schedules refactor rewrites. */
const MEETING_FILES = [
  'part-presets',
  'programme-templates',
  'programme-template-parts',
  'programme-template-part-allowed-roles',
  'programme-template-service-roles',
  'programme-template-service-role-allowed-roles',
  'programme-template-responsibles',
  'events',
  'absences',
  'attendance',
  'programme-part-assignments',
  'programme-part-assignment-allowed-roles',
  'programme-service-role-assignments',
  'programme-service-role-assignment-allowed-roles',
  'board-dynamic-document-settings',
] as const

let fixture: ReferenceCongregation
let targetId: number
/** A second congregation, for an archive from before v2.16. */
let olderTargetId: number

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: REFERENCE_NOW })
  fixture = await buildReferenceCongregation(`archive-${randomUUID().slice(0, 8)}`)
  const target = await referenceDb.congregation.create({
    data: {
      name: 'Assemblée importée',
      slug: `events-reference-import-${randomUUID().slice(0, 8)}`,
      active: true,
      locale: 'fr',
      timezone: REFERENCE_TIMEZONE,
    },
  })
  targetId = target.id
  const olderTarget = await referenceDb.congregation.create({
    data: {
      name: 'Assemblée importée d’une archive ancienne',
      slug: `events-reference-import-older-${randomUUID().slice(0, 8)}`,
      active: true,
      locale: 'fr',
      timezone: REFERENCE_TIMEZONE,
    },
  })
  olderTargetId = olderTarget.id
})

afterAll(async () => {
  vi.useRealTimers()
  if (fixture) await deleteReferenceCongregation(fixture.congregationId)
  if (targetId) await deleteReferenceCongregation(targetId)
  if (olderTargetId) await deleteReferenceCongregation(olderTargetId)
  await referenceDb.$disconnect()
})

async function exportArchive(congregationId: number): Promise<Record<string, unknown[]>> {
  const { buildExportSteps } = await import('~/features/settings/server/export-congregation.server')
  return withScope(congregationId, async db => {
    const files: Record<string, unknown[]> = {}
    for (const step of buildExportSteps(db, congregationId, { includeFiles: false, includeAuditLogs: false })) {
      files[step.name] = await step.export()
    }
    return files
  })
}

async function zipOf(files: Record<string, unknown[]>): Promise<JsZip> {
  const zip = new JsZip()
  const data = zip.folder('data')
  if (!data) throw new Error('could not create the archive’s data folder')
  for (const [name, lines] of Object.entries(files)) {
    data.file(`${name}.ndjson`, lines.map(line => JSON.stringify(line)).join('\n') + (lines.length > 0 ? '\n' : ''))
  }
  return JsZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }))
}

/** The `runImport` steps that meetings and the board depend on, in `runImport`'s order. Keep the order in step. */
async function importArchive(zip: JsZip, congregationId: number) {
  const mod = await import('~/features/settings/server/import-congregation.server')
  const { importAbsences } = await import('~/features/settings/server/import-absences.server')
  const { importAttendance } = await import('~/features/settings/server/import-attendance.server')
  const idMap = new EntityIdMap()
  const permissions = await referenceDb.permission.findMany({ select: { id: true, key: true } })
  const permissionKeyToId = new Map(permissions.map(permission => [permission.key, permission.id]))
  await withScope(congregationId, async db => {
    await mod.importSettings(zip, db, congregationId)
    await mod.importRoles(zip, db, idMap, congregationId)
    await mod.importRolePermissions(zip, db, idMap, permissionKeyToId, congregationId)
    await mod.importMembers(zip, db, idMap, congregationId)
    await mod.importUserAccounts(zip, db, idMap, congregationId)
    await mod.importUserRoleAssignments(zip, db, idMap, congregationId)
    await mod.importMemberRoleAssignments(zip, db, idMap, congregationId)
    await mod.importPublisherGroups(zip, db, idMap, congregationId)
    await mod.updateMemberPublisherGroups(zip, db, idMap, congregationId)
    await mod.importSpeakerCongregations(zip, db, idMap, congregationId)
    await mod.importExternalSpeakers(zip, db, idMap, congregationId)
    await mod.importPartPresets(zip, db, idMap, congregationId)
    await mod.importEventTemplates(zip, db, idMap, congregationId)
    await mod.importTemplateParts(zip, db, idMap, congregationId)
    await mod.importTemplatePartAllowedRoles(zip, db, idMap, congregationId)
    await mod.importTemplateServiceParts(zip, db, idMap, congregationId)
    await mod.importTemplateServicePartAllowedRoles(zip, db, idMap, congregationId)
    await mod.importTemplateResponsibles(zip, db, idMap, congregationId)
    const withoutOrigin = await mod.importEvents(zip, db, idMap, congregationId)
    await importAbsences(zip, db, idMap, congregationId)
    await importAttendance(zip, db, idMap, congregationId)
    await mod.importEventParts(zip, db, idMap, congregationId)
    await mod.importEventPartAllowedRoles(zip, db, idMap, congregationId)
    await mod.importEventServiceParts(zip, db, idMap, congregationId)
    await (await import('~/features/settings/server/import-events.server')).settleImportedEventOrigins(
      db,
      withoutOrigin,
      congregationId,
    )
    await mod.importEventServicePartAllowedRoles(zip, db, idMap, congregationId)
    await (await import('~/features/settings/server/import-schedules.server')).importSchedules(db, congregationId)
    await mod.importBoardSections(zip, db, idMap, congregationId)
    await mod.importBoardDynamicDocumentSettings(zip, db, idMap, congregationId)
  })
}

/** The meeting files, each file's rows sorted by their labelled content: an archive's row order means nothing. */
function meetingFiles(files: Record<string, unknown[]>, labels: ReadonlyMap<string, string>) {
  const missing = MEETING_FILES.filter(name => !(name in files))
  if (missing.length > 0) throw new Error(`the archive no longer has ${missing.join(', ')}`)
  const content = (line: unknown) => JSON.stringify(normalise(line, '', labels))
  return Object.fromEntries(
    MEETING_FILES.map(name => [name, [...files[name]].sort((a, b) => compareText(content(a), content(b)))]),
  )
}

/**
 * The imported congregation's ids labelled as the fixture's: people by first name, accounts by login, templates,
 * roles and presets by key, events by template and start, parts by meeting and order, services by meeting and name.
 * So the reference after the import says who holds what, as the one before it does.
 */
async function labelsOfImport(congregationId: number): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  const sourceLabel = (table: string, id: number) => fixture.labels.get(`${table}:${id}`)
  const byNaturalKey = async (cid: number) =>
    withScope(cid, async db => ({
      members: await db.member.findMany({ where: { congregationId: cid }, select: { id: true, firstname: true } }),
      accounts: await db.userAccount.findMany({ where: { congregationId: cid }, select: { id: true, email: true } }),
      roles: await db.role.findMany({ where: { congregationId: cid }, select: { id: true, key: true } }),
      presets: await db.partPreset.findMany({ where: { congregationId: cid }, select: { id: true, key: true } }),
      speakers: await db.externalSpeaker.findMany({ where: { congregationId: cid }, select: { id: true, name: true } }),
      sections: await db.boardSection.findMany({ where: { congregationId: cid }, select: { id: true, name: true } }),
      templates: await db.eventTemplate.findMany({
        where: { congregationId: cid },
        select: {
          id: true,
          key: true,
          parts: { select: { id: true, order: true } },
          serviceParts: { select: { id: true, key: true } },
        },
      }),
      events: await db.event.findMany({
        where: { congregationId: cid },
        select: {
          id: true,
          startDate: true,
          template: { select: { key: true } },
          eventParts: { select: { id: true, order: true } },
          eventServiceParts: { select: { id: true, name: true } },
        },
      }),
    }))
  const source = await byNaturalKey(fixture.congregationId)
  const target = await byNaturalKey(congregationId)

  const match = <S extends { id: number }, T extends { id: number }>(
    table: string,
    sources: S[],
    targets: T[],
    keyOfSource: (row: S) => string,
    keyOfTarget: (row: T) => string,
  ) => {
    const byKey = new Map(sources.map(row => [keyOfSource(row), sourceLabel(table, row.id)]))
    if (byKey.size !== sources.length) throw new Error(`two ${table} rows of the fixture share a matching key`)
    for (const row of targets) {
      const name = byKey.get(keyOfTarget(row))
      if (name) labels.set(`${table}:${row.id}`, name)
      // Every imported row of these tables has its original: one without would print `<id>` and hide a regression.
      else if (MATCHED_FULLY.has(table)) throw new Error(`an imported ${table} has no counterpart in the fixture`)
    }
  }
  match(
    'member',
    source.members,
    target.members,
    row => row.firstname,
    row => row.firstname,
  )
  match(
    'account',
    source.accounts,
    target.accounts,
    row => row.email,
    row => row.email.replace(IMPORTED_LOGIN, ''),
  )
  match(
    'role',
    source.roles,
    target.roles,
    row => row.key,
    row => row.key,
  )
  match(
    'preset',
    source.presets,
    target.presets,
    row => row.key,
    row => row.key,
  )
  match(
    'speaker',
    source.speakers,
    target.speakers,
    row => row.name,
    row => row.name,
  )
  match(
    'section',
    source.sections,
    target.sections,
    row => row.name,
    row => row.name,
  )
  match(
    'template',
    source.templates,
    target.templates,
    row => row.key,
    row => row.key,
  )
  const eventKey = (row: (typeof source.events)[number]) => `${row.template?.key} ${row.startDate.toISOString()}`
  match('event', source.events, target.events, eventKey, eventKey)
  const templatePartKey = (template: { key: string }, part: { order: number }) => `${template.key} ${part.order}`
  match(
    'templatePart',
    source.templates.flatMap(template =>
      template.parts.map(part => ({ id: part.id, key: templatePartKey(template, part) })),
    ),
    target.templates.flatMap(template =>
      template.parts.map(part => ({ id: part.id, key: templatePartKey(template, part) })),
    ),
    row => row.key,
    row => row.key,
  )
  const templateServiceKey = (template: { key: string }, service: { key: string | null }) =>
    `${template.key} ${service.key}`
  match(
    'templateServicePart',
    source.templates.flatMap(t =>
      t.serviceParts.map(service => ({ id: service.id, key: templateServiceKey(t, service) })),
    ),
    target.templates.flatMap(t =>
      t.serviceParts.map(service => ({ id: service.id, key: templateServiceKey(t, service) })),
    ),
    row => row.key,
    row => row.key,
  )
  const items = (events: typeof source.events) => ({
    parts: events.flatMap(e => e.eventParts.map(part => ({ id: part.id, key: `${eventKey(e)} ${part.order}` }))),
    services: events.flatMap(e =>
      e.eventServiceParts.map(service => ({ id: service.id, key: `${eventKey(e)} ${service.name}` })),
    ),
  })
  match(
    'eventPart',
    items(source.events).parts,
    items(target.events).parts,
    row => row.key,
    row => row.key,
  )
  match(
    'eventServicePart',
    items(source.events).services,
    items(target.events).services,
    row => row.key,
    row => row.key,
  )
  return labels
}

/** What each board document of a congregation reads, in the board's order. */
function readDocuments(congregationId: number) {
  return withScope(congregationId, async db => {
    const settings = await db.boardDynamicDocumentSettings.findMany({
      where: { congregationId },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    })
    const documents: { title: string; data: unknown }[] = []
    for (const document of settings) {
      documents.push({
        title: document.title,
        data: await getDynamicDocumentData(db, document.dynamicType, document.dynamicRef, congregationId, {
          showServices: document.showServices,
          dynamicConfig: document.dynamicConfig,
          attendance: { timeZone: REFERENCE_TIMEZONE, now: REFERENCE_NOW },
        }),
      })
    }
    return documents
  })
}

/** A copy of what a document reads, without the templates' recurring mark. */
function withoutMark(data: unknown): unknown {
  return JSON.parse(JSON.stringify(data, (key, value) => (key === 'generatedUntil' ? undefined : value)))
}

/**
 * An archive as a version before 2.16 wrote it: no event status, no template hours, no document configuration — and its
 * absences as day-off events of a day-off template, with no absences file (2.19), so they come back from those events.
 */
function asBefore216(files: Record<string, unknown[]>): Record<string, unknown[]> {
  const without = (name: string, keys: string[]) =>
    (files[name] ?? []).map(line =>
      Object.fromEntries(Object.entries(line as object).filter(([key]) => !keys.includes(key))),
    )
  const { absences = [], ...rest } = files
  const dayOff = { id: 999_999, name: 'Absence', key: 'day-off', description: '', weekDay: null, isRecurring: false }
  const dayOffs = (
    absences as { id: number; startDate: string; endDate: string; note: string; accountId: number }[]
  ).map(absence => ({
    id: 999_000 + absence.id,
    name: 'Absence',
    description: absence.note,
    startDate: absence.startDate,
    endDate: absence.endDate,
    templateId: dayOff.id,
    createdById: absence.accountId,
    createdAt: absence.startDate,
  }))
  return {
    ...rest,
    events: [...without('events', ['status']), ...dayOffs],
    'programme-templates': [...without('programme-templates', ['startTime', 'endTime']), dayOff],
    'board-dynamic-document-settings': without('board-dynamic-document-settings', ['dynamicConfig']),
  }
}

describe('the archive', () => {
  it('carries the same meetings, and a new congregation reads them back', async () => {
    const exported = await exportArchive(fixture.congregationId)
    await expect(reference(Object.keys(exported).sort())).toMatchFileSnapshot('./__references__/archive-files.json')
    await expect(reference(meetingFiles(exported, fixture.labels), fixture.labels)).toMatchFileSnapshot(
      './__references__/archive-export.json',
    )

    // Logins are unique across the database, and an import usually lands on another instance: renamed here.
    const accounts = exported['user-accounts']
    if (!accounts || accounts.length === 0) throw new Error('the archive carries no account')
    const renamed = accounts.map(line => ({
      ...(line as object),
      email: `imported-${(line as { email: string }).email}`,
    }))
    await importArchive(await zipOf({ ...exported, 'user-accounts': renamed }), targetId)
    const imported = await labelsOfImport(targetId)

    const reimported = await exportArchive(targetId)
    const programmeDocuments = await readDocuments(targetId)
    // All four, though they share a type and an empty ref.
    expect(programmeDocuments.map(document => document.title)).toEqual([
      'Programme by-date',
      'Programme by-template',
      'Programme midweek-parts',
      'Programme weekend-services',
    ])
    // And each reads in the new congregation what it reads in the old one — but for the templates' recurring mark,
    // which the import resets on purpose so the daily job starts again after the archive's last meeting.
    const originals = await readDocuments(fixture.congregationId)
    expect(originals.map(document => document.title)).toEqual(programmeDocuments.map(document => document.title))
    for (const [index, document] of programmeDocuments.entries()) {
      expect(reference(withoutMark(document.data), imported), document.title).toBe(
        reference(withoutMark(originals[index].data), fixture.labels),
      )
    }
    const statuses = await withScope(targetId, db =>
      db.event.groupBy({
        by: ['status'],
        where: { congregationId: targetId },
        _count: true,
        orderBy: { status: 'asc' },
      }),
    )

    await expect(
      reference({ archive: meetingFiles(reimported, imported), eventStatuses: statuses, programmeDocuments }, imported),
    ).toMatchFileSnapshot('./__references__/archive-after-import.json')
  })

  it('from before v2.16 imports as it always did: drafts, default hours, no configuration', async () => {
    const exported = await exportArchive(fixture.congregationId)
    const renamed = (exported['user-accounts'] ?? []).map(line => ({
      ...(line as object),
      email: `older-${(line as { email: string }).email}`,
    }))
    await importArchive(await zipOf({ ...asBefore216(exported), 'user-accounts': renamed }), olderTargetId)

    const after = await withScope(olderTargetId, async db => ({
      statuses: await db.event.groupBy({
        by: ['status'],
        where: { congregationId: olderTargetId },
        _count: true,
        orderBy: { status: 'asc' },
      }),
      hours: await db.eventTemplate.findMany({
        where: { congregationId: olderTargetId },
        select: { key: true, startTime: true, endTime: true },
        orderBy: { key: 'asc' },
      }),
      configurations: await db.boardDynamicDocumentSettings.findMany({
        where: { congregationId: olderTargetId },
        select: { title: true, dynamicConfig: true },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      }),
      absences: await db.absence.findMany({
        where: { congregationId: olderTargetId },
        select: { memberId: true },
      }),
    }))

    // Hugo's day-off is not restored as an event, nor its template: an absence is its row alone.
    expect(after.statuses).toEqual([{ _count: 18, status: 'draft' }])
    expect(after.hours.map(template => template.key)).not.toContain('day-off')
    expect(new Set(after.hours.map(template => `${template.startTime}–${template.endTime}`))).toEqual(
      new Set(['19:00–21:00']),
    )
    expect(after.configurations).toHaveLength(4)
    expect(after.configurations.every(document => document.dynamicConfig === null)).toBe(true)
    // No absences file: Hugo's absence comes back from his day-off, on his record, without the event.
    expect(after.absences).toEqual([{ memberId: expect.any(Number) }])
  })
})
