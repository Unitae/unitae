// The demo congregation, written into any congregation: the marketing seed's (`seed-marketing.ts`, for the
// captures and local QA) and the copies a visitor opens (`seedPendingDemoCopies`). Generated, not copied: its proportions follow a real
// congregation of about 110 publishers (`profile.ts`), its people, streets and dates are invented, and everything is
// relative to `now` and drawn from a fixed seed, so two runs on the same day write the same congregation.
import { randomBytes, scrypt } from 'node:crypto'
import { DEMO_ACCOUNTS_SETTING, DEMO_ROLES, type DemoRole } from '../../features/demo/model/demo-role'
import {
  DEMO_SHARED_BOARD_PREFIX,
  deleteBoardFile,
  saveBoardFile,
  saveThumbnailFile,
} from '../../features/display-board/server/document-storage.server'
import { generateThumbnail } from '../../features/display-board/server/thumbnail.server'
import { EventTemplateKey } from '../../features/events/model/event-template.type'
import { PartPresetKey } from '../../features/events/model/part-preset.type'
import { normalizeCongregationName } from '../../features/events/model/speaker-congregation-name'
import { syncTemplateScheduleTemplates } from '../../features/events/server/schedule-templates.server'
import { attachEventItems } from '../../features/events/server/schedules.server'
import { seedDefaultTemplates } from '../../features/events/server/seed-templates.server'
import { seedBuiltInTerritoryKinds } from '../../features/territories/server/territory-kinds.server'
import { syncBuiltInRoleAssignments } from '../../shared/domain/built-in-roles.server'
import { CONSENT_VERSION, ConsentPurpose } from '../../shared/domain/consent.server'
import { ensureAdminRole, placeDefaultOrganigram, seedBuiltInRoles } from '../../shared/domain/setup.server'
import { uploadFile } from '../../shared/infra/file-storage.server'
import type { PrismaClient } from '../generated/client'
import { type BoardSection, boardDocuments } from './board'
import { boardPdf } from './board-pdf'
import { pickStudentPart, rankDemoPublishers } from './demo-publisher'
import { generateAttributions, generatePioneers, generateReports } from './history'
import {
  classifyParts,
  generateAbsences,
  generateAttendance,
  generateExternalSpeakers,
  generateMeetings,
  type MeetingKind,
  type PartKind,
  partRoles,
  type TemplateSpec,
} from './meetings'
import { type Congregation, generateCongregation } from './people'
import { generateArea } from './places'
import { CUSTOM_ROLES, DEMO_RESPONSIBLES, MEETINGS, SEED, SERVICE_ROLES, SETTINGS } from './profile'
import { Random } from './random'
import { assignRoleHolders, demoRolePersons } from './roles'
import { loginEmail, writeArea, writeAttributions, writeHistory, writePeople } from './write'

// Hand-mirrors app/shared/auth/crypto.server.ts so seeded demo logins verify through the shared
// `compare`: current scrypt parameters (N=2^17), raised maxmem, self-describing storage format.
// This standalone seed script can't import server-only modules, so the params/format are
// duplicated here — keep them in sync by hand if CURRENT_PARAMS ever changes (not enforced).
function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString('hex')
    scrypt(password, salt, 32, { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(`scrypt$131072$8$1$${salt}$${derivedKey.toString('hex')}`)
    })
  })
}

/** Everything the demo writes, children before parents; the built-in roles and territory kinds stay. */
export async function cleanCongregationData(prisma: PrismaClient, congregationId: number) {
  const where = { congregationId }
  await prisma.eventServicePartAllowedRole.deleteMany({ where })
  await prisma.eventPartAllowedRole.deleteMany({ where })
  await prisma.eventServicePart.deleteMany({ where })
  await prisma.eventPart.deleteMany({ where })
  await prisma.schedule.deleteMany({ where })
  await prisma.templateServicePartAllowedRole.deleteMany({ where })
  await prisma.templatePartAllowedRole.deleteMany({ where })
  await prisma.templateResponsible.deleteMany({ where })
  // The items before their schedule templates: one no kind uses owns its items, which cannot be left with no owner.
  await prisma.templateServicePart.deleteMany({ where })
  await prisma.templatePart.deleteMany({ where })
  await prisma.scheduleTemplate.deleteMany({ where })
  // Before the events and the accounts: an Absence row names its account (Restrict), not its event.
  await prisma.absence.deleteMany({ where })
  await prisma.event.deleteMany({ where })
  await prisma.eventTemplate.deleteMany({ where })
  // After the parts that point at them, before the congregation itself: the FK to Congregation restricts.
  await prisma.partPreset.deleteMany({ where })
  await prisma.externalSpeaker.deleteMany({ where })
  await prisma.speakerCongregation.deleteMany({ where })
  await prisma.ourSpeaker.deleteMany({ where })
  await prisma.boardDynamicDocumentView.deleteMany({ where: { settings: { congregationId } } })
  await prisma.boardDynamicDocumentSettings.deleteMany({ where })
  await prisma.boardDocumentView.deleteMany({ where })
  // The board's files go with their rows: each run would otherwise leave its PDFs and thumbnails behind.
  const boardFiles = [
    ...(await prisma.boardDocument.findMany({ where, select: { uri: true, thumbnailUri: true } })),
    ...(await prisma.boardDocumentVersion.findMany({ where, select: { uri: true, thumbnailUri: true } })),
  ].flatMap(file => [file.uri, file.thumbnailUri])
  // deleteBoardFile keeps the files every demo copy shares.
  for (const key of new Set(boardFiles)) if (key) await deleteBoardFile(key)
  await prisma.boardDocumentVersion.deleteMany({ where })
  await prisma.boardDocument.deleteMany({ where })
  await prisma.boardSectionVisibilityRole.deleteMany({ where })
  await prisma.boardSection.deleteMany({ where })
  await prisma.campaignTerritory.deleteMany({ where })
  await prisma.attribution.deleteMany({ where })
  await prisma.campaign.deleteMany({ where })
  await prisma.buildingResidentialData.deleteMany({ where })
  await prisma.buildingAccess.deleteMany({ where })
  await prisma.buildingEntrance.deleteMany({ where })
  await prisma.building.deleteMany({ where })
  await prisma.buildingSync.deleteMany({ where })
  await prisma.territoryCardOverlay.deleteMany({ where })
  await prisma.territoryPerimeter.deleteMany({ where })
  await prisma.territoryKindAllowedRole.deleteMany({ where })
  await prisma.territory.deleteMany({ where })
  await prisma.publisherActivity.deleteMany({ where })
  await prisma.pioneerEnrolment.deleteMany({ where })
  await prisma.pioneerGoal.deleteMany({ where })
  await prisma.emergencyContact.deleteMany({ where })
  await prisma.notificationEvent.deleteMany({ where })
  await prisma.notificationPreference.deleteMany({ where })
  await prisma.consentRecord.deleteMany({ where })
  await prisma.auditLog.deleteMany({ where })
  await prisma.dataDeletionRecord.deleteMany({ where })
  await prisma.userRoleAssignment.deleteMany({ where })
  await prisma.memberRoleAssignment.deleteMany({ where })
  await prisma.rolePermission.deleteMany({ where: { congregationId, role: { isBuiltIn: false } } })
  // A custom role may parent another, and the tree restricts deletes: detach them first.
  await prisma.role.updateMany({ where: { congregationId, isBuiltIn: false }, data: { parentRoleId: null } })
  await prisma.role.deleteMany({ where: { congregationId, isBuiltIn: false } })
  await prisma.member.updateMany({ where, data: { publisherGroupId: null } })
  await prisma.publisherGroup.deleteMany({ where })
  await prisma.userAccount.deleteMany({ where })
  await prisma.member.deleteMany({ where })
  await prisma.setting.deleteMany({ where })
}

async function writeGroups(
  prisma: PrismaClient,
  congregationId: number,
  congregation: Congregation,
  members: number[],
) {
  for (const [index, group] of congregation.groups.entries()) {
    const row = await prisma.publisherGroup.create({
      data: {
        name: group.name,
        adress: group.address,
        responsibleId: members[group.responsible] as number,
        deputyId: group.deputy == null ? null : (members[group.deputy] as number),
        congregationId,
      },
    })
    const inGroup = congregation.people
      .filter(person => person.group === index)
      .map(person => members[person.key] as number)
    await prisma.member.updateMany({ where: { id: { in: inGroup } }, data: { publisherGroupId: row.id } })
  }
}

/** The custom roles under the organigram's built-in ones, their permissions, then who holds what. */
async function writeRoles(
  prisma: PrismaClient,
  congregationId: number,
  congregation: Congregation,
  accounts: Map<number, number>,
  members: number[],
  holders: Map<string, number[]>,
): Promise<Map<string, number>> {
  const builtIns = await prisma.role.findMany({
    where: { congregationId, isBuiltIn: true },
    select: { id: true, key: true },
  })
  const ids = new Map(builtIns.map(role => [role.key, role.id]))
  const permissions = new Map(
    (await prisma.permission.findMany({ select: { id: true, key: true } })).map(p => [p.key, p.id]),
  )
  const siblings = new Map<string, number>()

  for (const role of CUSTOM_ROLES) {
    const parentRoleId = role.parent ? (ids.get(role.parent) ?? null) : null
    const order = (siblings.get(role.parent ?? '') ?? 0) + 1
    siblings.set(role.parent ?? '', order)
    const row = await prisma.role.create({
      data: {
        key: role.key,
        name: role.name,
        isBuiltIn: false,
        parentRoleId,
        showInOrganigram: parentRoleId != null,
        organigramOrder: parentRoleId == null ? null : order * 10,
        isSinglePerson: role.single ?? false,
        congregationId,
      },
    })
    ids.set(role.key, row.id)
    await prisma.rolePermission.createMany({
      data: (role.permissions ?? [])
        .filter(key => permissions.has(key))
        .map(key => ({ roleId: row.id, permissionId: permissions.get(key) as number, congregationId })),
    })
  }

  // Roles belong to the person, on their record; only `admin`, an access, sits on the login.
  const onLogin: { userId: number; roleId: number; congregationId: number }[] = []
  const onRecord: { memberId: number; roleId: number; congregationId: number; kind: string }[] = []
  const grantAdmin = (person: number) => {
    const userId = accounts.get(person)
    const roleId = ids.get('admin')
    if (userId != null && roleId != null) onLogin.push({ userId, roleId, congregationId })
  }
  const grant = (person: number, roleKey: string, kind = 'member') => {
    const memberId = members[person]
    const roleId = ids.get(roleKey)
    if (memberId != null && roleId != null) onRecord.push({ memberId, roleId, congregationId, kind })
  }
  grantAdmin(congregation.admin)
  grantAdmin(congregation.secretary)
  grant(congregation.coordinator, 'coordinator', 'leader')
  grant(congregation.secretary, 'secretary', 'leader')
  grant(congregation.serviceOverseer, 'service-overseer', 'leader')
  for (const [roleKey, people] of holders) for (const person of people) grant(person, roleKey)
  await prisma.userRoleAssignment.createMany({ data: onLogin, skipDuplicates: true })
  await prisma.memberRoleAssignment.createMany({ data: onRecord, skipDuplicates: true })
  return ids
}

/**
 * The two meeting templates as the congregation runs them: Thursday evening and Saturday afternoon, a chairman, the
 * eight service roles, and each part restricted to the role whose holders give it.
 */
async function arrangeTemplates(prisma: PrismaClient, congregationId: number, roleIds: Map<string, number>) {
  await seedDefaultTemplates(prisma, congregationId, 'fr')
  const presets = await prisma.partPreset.findMany({ where: { congregationId }, select: { id: true, key: true } })
  const presetKey = new Map(presets.map(preset => [preset.id, preset.key]))
  const chairman = presets.find(preset => preset.key === PartPresetKey.Chairman)
  const specs: TemplateSpec[] = []
  const templateIds = {} as Record<MeetingKind, number>
  const keys: Record<MeetingKind, EventTemplateKey> = {
    midweek: EventTemplateKey.MidweekMeeting,
    weekend: EventTemplateKey.WeekendMeeting,
  }

  for (const kind of ['midweek', 'weekend'] as const) {
    const config = MEETINGS[kind]
    const template = await prisma.eventTemplate.findFirstOrThrow({ where: { key: keys[kind], congregationId } })
    templateIds[kind] = template.id
    await prisma.eventTemplate.update({
      where: { id: template.id },
      data: { weekDay: config.weekDay, startTime: config.start, endTime: config.end },
    })
    // A song needs nobody: the congregation's own templates leave them out, so the programme shows only parts to fill.
    await prisma.templatePart.deleteMany({ where: { templateId: template.id, presetId: null, section: '' } })
    await prisma.templatePart.create({
      data: {
        name: 'Présidence',
        section: '',
        order: 0,
        durationMin: 2,
        templateId: template.id,
        presetId: chairman?.id ?? null,
        congregationId,
      },
    })
    await prisma.templateServicePart.deleteMany({ where: { templateId: template.id } })
    const services = await prisma.templateServicePart.createManyAndReturn({
      data: SERVICE_ROLES.map((service, index) => ({
        name: service.name,
        key: service.key,
        order: index * 5,
        templateId: template.id,
        congregationId,
      })),
      select: { id: true, key: true },
    })
    const serviceRole = new Map(SERVICE_ROLES.map(service => [service.key as string, service.role as string]))
    await prisma.templateServicePartAllowedRole.createMany({
      data: services.map(service => ({
        servicePartId: service.id,
        roleId: roleIds.get(serviceRole.get(service.key) ?? '') as number,
        congregationId,
      })),
    })

    const parts = await prisma.templatePart.findMany({ where: { templateId: template.id }, orderBy: { order: 'asc' } })
    const kinds = classifyParts(
      parts.map(part => ({
        preset: part.presetId ? (presetKey.get(part.presetId) ?? null) : null,
        section: part.section,
      })),
    )
    await prisma.templatePartAllowedRole.createMany({
      data: parts.flatMap((part, index) => {
        const { speaker, reader } = partRoles(kinds[index] as PartKind, kind)
        return [
          ...(speaker
            ? [{ partId: part.id, roleId: roleIds.get(speaker) as number, asKind: 'speaker', congregationId }]
            : []),
          ...(reader
            ? [{ partId: part.id, roleId: roleIds.get(reader) as number, asKind: 'reader', congregationId }]
            : []),
        ]
      }),
    })
    // Who prepares each meeting's programme, and who its duties: as the congregation's organigram names them.
    const responsibles = DEMO_RESPONSIBLES[kind]
    await prisma.templateResponsible.createMany({
      data: [
        {
          templateId: template.id,
          roleId: roleIds.get(responsibles.programme) as number,
          scope: 'programme',
          congregationId,
        },
        {
          templateId: template.id,
          roleId: roleIds.get(responsibles.service) as number,
          scope: 'service',
          congregationId,
        },
      ],
    })
    await syncTemplateScheduleTemplates(prisma, template.id, congregationId)
    specs.push({
      kind,
      parts: parts.map((part, index) => ({ id: part.id, kind: kinds[index] as PartKind })),
      services: services.map(service => ({ id: service.id, role: serviceRole.get(service.key) as string })),
    })
  }
  return { specs, templateIds }
}

async function writeMeetings(
  prisma: PrismaClient,
  congregationId: number,
  meetings: ReturnType<typeof generateMeetings>,
  templateIds: Record<MeetingKind, number>,
  members: number[],
  speakers: number[],
  createdById: number,
) {
  const templateParts = new Map(
    (await prisma.templatePart.findMany({ where: { congregationId } })).map(part => [part.id, part]),
  )
  const partRoles = await prisma.templatePartAllowedRole.findMany({ where: { congregationId } })
  const serviceParts = new Map(
    (await prisma.templateServicePart.findMany({ where: { congregationId } })).map(part => [part.id, part]),
  )
  const serviceRoles = await prisma.templateServicePartAllowedRole.findMany({ where: { congregationId } })
  const presetIds = new Map(
    (await prisma.partPreset.findMany({ where: { congregationId }, select: { id: true, key: true } })).map(preset => [
      preset.key,
      preset.id,
    ]),
  )
  const names = { midweek: 'Réunion de semaine', weekend: 'Réunion du week-end' }
  const memberId = (key: number | null) => (key == null ? null : (members[key] as number))

  const events = await prisma.event.createManyAndReturn({
    data: meetings.map(meeting => ({
      name: names[meeting.kind],
      startDate: meeting.start,
      endDate: meeting.end,
      status: meeting.status,
      templateId: templateIds[meeting.kind],
      createdById,
      congregationId,
    })),
    select: { id: true },
  })

  const parts = await prisma.eventPart.createManyAndReturn({
    data: meetings.flatMap((meeting, index) =>
      meeting.parts.map(part => {
        const template = templateParts.get(part.templatePart)
        if (!template) throw new Error(`Unknown template part ${part.templatePart}`)
        return {
          name: template.name,
          section: template.section,
          track: template.track,
          trackOrder: template.trackOrder,
          order: template.order,
          durationMin: template.durationMin,
          speakerLabel: template.speakerLabel,
          readerLabel: template.readerLabel,
          allowExternalSpeaker: template.allowExternalSpeaker,
          partId: template.id,
          // A student part's kind is the week's (the talk or a demonstration): the template leaves it open.
          presetId: part.preset ? (presetIds.get(part.preset) ?? template.presetId) : template.presetId,
          eventId: events[index]?.id as number,
          assigneeId: memberId(part.assignee),
          assistantId: memberId(part.assistant),
          externalSpeakerId: part.externalSpeaker == null ? null : (speakers[part.externalSpeaker] as number),
          topic: part.topic,
          congregationId,
        }
      }),
    ),
    select: { id: true, partId: true },
  })
  // Each event part carries its own copy of who may give it, as when the app creates an event from its template.
  await prisma.eventPartAllowedRole.createMany({
    data: parts.flatMap(part =>
      partRoles
        .filter(role => role.partId === part.partId)
        .map(role => ({ eventPartId: part.id, roleId: role.roleId, asKind: role.asKind, congregationId })),
    ),
  })

  const services = await prisma.eventServicePart.createManyAndReturn({
    data: meetings.flatMap((meeting, index) =>
      meeting.services.map((service, position) => ({
        name: serviceParts.get(service.templateService)?.name ?? '',
        servicePartId: service.templateService,
        order: position * 5,
        eventId: events[index]?.id as number,
        assigneeId: memberId(service.assignee),
        congregationId,
      })),
    ),
    select: { id: true, servicePartId: true },
  })
  await prisma.eventServicePartAllowedRole.createMany({
    data: services.flatMap(service =>
      serviceRoles
        .filter(role => role.servicePartId === service.servicePartId)
        .map(role => ({ eventServicePartId: service.id, roleId: role.roleId, congregationId })),
    ),
  })
  const eventIds = events.map(event => event.id)
  await attachEventItems(prisma, eventIds, congregationId)
  return eventIds
}

/**
 * The board as a congregation keeps it: its sections, a PDF for each document (with the thumbnail the worker would
 * make, where pdftoppm is installed), and the documents the app writes from its own data.
 */
async function writeBoard(
  prisma: PrismaClient,
  congregationId: number,
  templateIds: Record<MeetingKind, number>,
  board: { sections: BoardSection[]; congregation: string; uploadedById: number; now: Date; sharedFiles?: boolean },
) {
  const sections: number[] = []
  let documents = 0
  for (const [index, section] of board.sections.entries()) {
    const row = await prisma.boardSection.create({ data: { name: section.name, order: index + 1, congregationId } })
    sections.push(row.id)
    for (const [order, document] of section.documents.entries()) {
      const pdf = await boardPdf(board.congregation, document, { demo: board.sharedFiles })
      let uri: string
      let thumbnailUri: string | null
      if (board.sharedFiles) {
        // Every copy points at the same files, rewritten in place: deleting a copy leaves nothing behind.
        uri = `${DEMO_SHARED_BOARD_PREFIX}/${index}-${order}.pdf`
        await uploadFile(uri, await pdf.arrayBuffer(), 'application/pdf')
        const thumbnail = await generateThumbnail(uri)
        thumbnailUri = thumbnail ? `${DEMO_SHARED_BOARD_PREFIX}/${index}-${order}.thumb.png` : null
        if (thumbnail && thumbnailUri) await uploadFile(thumbnailUri, thumbnail, 'image/png')
      } else {
        uri = await saveBoardFile(congregationId, new File([pdf], 'document.pdf', { type: 'application/pdf' }))
        const thumbnail = await generateThumbnail(uri)
        thumbnailUri = thumbnail ? await saveThumbnailFile(congregationId, thumbnail) : null
      }
      const createdAt = new Date(board.now.getTime() - document.age * 24 * 60 * 60 * 1000)
      await prisma.boardDocument.create({
        data: {
          title: document.title,
          type: 'pdf',
          uri,
          thumbnailUri,
          sectionId: row.id,
          order: order + 1,
          isHighlighted: document.highlighted,
          createdAt,
          visibleFrom: createdAt,
          congregationId,
          versions: {
            create: {
              uri,
              thumbnailUri,
              versionNumber: 1,
              uploadedById: board.uploadedById,
              createdAt,
              congregationId,
            },
          },
        },
      })
      documents++
    }
  }
  const programme = (ids: number[]) => ({
    templates: ids.map(templateId => ({ templateId, parts: true, services: true })),
    groupBy: 'date',
  })
  const [, programmes, preaching, , , life] = sections as [number, number, number, number, number, number]
  await prisma.boardDynamicDocumentSettings.createMany({
    data: [
      {
        title: 'Réunion de semaine',
        dynamicType: 'programme',
        dynamicConfig: programme([templateIds.midweek]),
        sectionId: programmes,
        order: 10,
        showServices: true,
      },
      {
        title: 'Réunion du week-end',
        dynamicType: 'programme',
        dynamicConfig: programme([templateIds.weekend]),
        sectionId: programmes,
        order: 11,
        showServices: true,
      },
      {
        title: 'Programme des réunions',
        dynamicType: 'programme',
        dynamicConfig: programme([templateIds.midweek, templateIds.weekend]),
        sectionId: programmes,
        order: 12,
        showServices: false,
      },
      { title: 'Pionniers', dynamicType: 'pioneers', sectionId: preaching, order: 10, showServices: false },
      {
        title: 'Groupes de prédication',
        dynamicType: 'publisher-groups',
        sectionId: life,
        order: 10,
        showServices: false,
      },
      { title: 'Organigramme', dynamicType: 'organigram', sectionId: life, order: 11, showServices: false },
    ].map(document => ({ ...document, isHighlighted: false, congregationId })),
  })
  return documents
}

/** « É. Le Roux », as a programme names a speaker. */
function shortName(name: string): string {
  const [first = '', ...rest] = name.split(' ')
  return `${first.charAt(0)}. ${rest.join(' ')}`
}

export interface SeedDemoOptions {
  /** The day the demo is built around. */
  now?: Date
  /** Added to every login's address (`marc.dupont+demo-x7k2p@…`, the copy's slug): a login's address is unique across congregations. */
  emailSuffix?: string
  /** Where progress lines go; nowhere by default. */
  log?: (line: string) => void
  /** Record which login each demo role signs in as (a visitor's copy), creating one where the person has none. */
  demoLogins?: boolean
  /** Point the board's documents at files every copy shares (`demo-shared/board/…`), never deleted with a copy. */
  sharedBoardFiles?: boolean
}

/**
 * Fills an empty congregation with the demo: people and logins (password `demo1234`), groups, roles, territories,
 * meetings and their programmes, the board. The congregation must hold no demo data yet (`cleanCongregationData`).
 */
export async function seedDemoCongregation(
  prisma: PrismaClient,
  congregation: { id: number; name: string },
  options: SeedDemoOptions = {},
) {
  const now = options.now ?? new Date()
  const log = options.log ?? (() => {})

  const random = new Random(SEED)

  const congregationId = congregation.id

  await seedBuiltInRoles(prisma, congregationId)
  await ensureAdminRole(prisma, congregationId)
  await placeDefaultOrganigram(prisma, congregationId)
  await seedBuiltInTerritoryKinds(prisma, congregationId)

  const area = generateArea(random, now)
  const people = generateCongregation(random, now, area.addresses)
  const stints = generatePioneers(random, people.people, now)
  const { reports, inactiveAt } = generateReports(random, people.people, stints, now)
  const attributions = generateAttributions(random, area.territories, people.people, stints, now)

  await prisma.setting.createMany({
    // Postal codes are kept as a JSON list, as the territory settings save them.
    data: [...Object.entries(SETTINGS), ['zips', JSON.stringify(area.zips)]].map(([key, value]) => ({
      key: key as string,
      value: value as string,
      congregationId,
    })),
  })

  // A visitor's copy is entered through its one-time link only: its logins get a password nobody knows, or anyone who
  // saw a copy's address could sign in with the marketing demo's.
  const password = await hashPassword(options.demoLogins ? randomBytes(24).toString('base64url') : 'demo1234')
  const { members, accounts } = await writePeople(
    prisma,
    congregationId,
    people.people,
    inactiveAt,
    password,
    options.emailSuffix,
  )
  await writeHistory(prisma, congregationId, members, stints, reports)
  // The identity roles (publisher, baptized, pioneer…) follow from each member's flags and enrolments.
  for (const id of members) await syncBuiltInRoleAssignments(prisma, id, congregationId, null)
  await writeGroups(prisma, congregationId, people, members)
  log(
    `  ✓ ${members.length} people (${accounts.size} logins), ${people.groups.length} groups, ${reports.length} reports`,
  )

  const holders = assignRoleHolders(
    random,
    people.people,
    now,
    [people.admin, people.secretary, people.serviceOverseer],
    people.groups.map(group => group.responsible),
  )
  const roleIds = await writeRoles(prisma, congregationId, people, accounts, members, holders)
  log(`  ✓ ${CUSTOM_ROLES.length} congregation roles`)

  // « Notre liste »: most public speakers go on the list we send, with the talks they prepare; one has yet to give
  // his. Drawn from a source of their own, so the rest of the congregation keeps its draws.
  const ourList = new Random(0x0a751)
  const publicSpeakers = holders.get('discours-publics') ?? []
  await prisma.ourSpeaker.createMany({
    data: publicSpeakers.map((person, index) => ({
      memberId: members[person] as number,
      onList: index < publicSpeakers.length - 2,
      talks:
        index < publicSpeakers.length - 3
          ? [...new Set(Array.from({ length: ourList.int(2, 6) }, () => ourList.int(1, 194)))].sort((a, b) => a - b)
          : [],
      congregationId,
    })),
  })

  const territories = await writeArea(prisma, congregationId, area)
  await writeAttributions(prisma, congregationId, { members, territories }, attributions)
  log(`  ✓ ${territories.length} territories, ${area.buildings.length} buildings, ${attributions.length} attributions`)

  const speakerSeeds = generateExternalSpeakers(random)
  const speakerCongregations = new Map<string, number>()
  for (const [index, town] of [...new Set(speakerSeeds.map(speaker => speaker.congregationName))].entries()) {
    const responsible = speakerSeeds.find(speaker => speaker.congregationName === town)
    const row = await prisma.speakerCongregation.create({
      data: {
        name: town,
        nameNormalized: normalizeCongregationName(town),
        responsibleName: responsible?.name ?? '',
        responsiblePhone: responsible?.phone ?? '',
        responsibleEmail: responsible?.email ?? '',
        // Lists received over the past year and a half: some are due for an update.
        listDate: new Date(now.getTime() - (30 + ((index * 47) % 520)) * 24 * 60 * 60 * 1000),
        congregationId,
      },
    })
    speakerCongregations.set(town, row.id)
  }
  const speakerRows = await prisma.externalSpeaker.createManyAndReturn({
    data: speakerSeeds.map(speaker => ({
      ...speaker,
      speakerCongregationId: speakerCongregations.get(speaker.congregationName) ?? null,
      congregationId,
    })),
    select: { id: true },
  })
  const { specs, templateIds } = await arrangeTemplates(prisma, congregationId, roleIds)
  const absences = generateAbsences(random, people.people, now)
  const meetings = generateMeetings(random, now, specs, people.people, holders, absences)
  const adminAccount = accounts.get(people.admin) as number
  const eventIds = await writeMeetings(
    prisma,
    congregationId,
    meetings,
    templateIds,
    members,
    speakerRows.map(row => row.id),
    adminAccount,
  )
  const meetingCount = eventIds.length
  // Every past meeting counted, entered by the administrator; the publishers still here set the size.
  const activePublishers = people.people.filter(person => person.leftAt == null && !person.goesInactive).length
  const attendance = generateAttendance(meetings, now, activePublishers)
  await prisma.attendance.createMany({
    data: attendance.flatMap((counts, index) =>
      counts == null
        ? []
        : [
            {
              eventId: eventIds[index] as number,
              inPerson: counts.inPerson,
              inPersonById: adminAccount,
              inPersonAt: meetings[index]?.start,
              online: counts.online,
              onlineById: counts.online == null ? null : adminAccount,
              onlineAt: counts.online == null ? null : meetings[index]?.start,
              congregationId,
            },
          ],
    ),
  })

  await prisma.absence.createMany({
    data: absences.map(absence => ({
      startDate: absence.start,
      endDate: absence.end,
      memberId: members[absence.person] as number,
      accountId: accounts.get(absence.person) as number,
      congregationId,
    })),
  })
  log(`  ✓ ${meetingCount} meetings, ${absences.length} absences, ${speakerRows.length} visiting speakers`)

  // The public talks sheet lists the coming talks as the weekend programme gives them.
  const publicTalks = new Set(
    specs.flatMap(spec => spec.parts.filter(part => part.kind === 'public-talk').map(part => part.id)),
  )
  const talks = meetings
    .filter(meeting => meeting.start >= now)
    .flatMap(meeting =>
      meeting.parts
        .filter(part => publicTalks.has(part.templatePart))
        .flatMap(part => {
          const member = part.assignee == null ? null : people.people[part.assignee]
          const speaker =
            part.externalSpeaker == null
              ? member && `${member.firstname} ${member.lastname}`
              : speakerSeeds[part.externalSpeaker]?.name
          return speaker ? [{ date: meeting.start, title: part.topic, speaker: shortName(speaker) }] : []
        }),
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime())
  const host = people.people[people.groups[0]?.responsible ?? people.admin]?.lastname ?? ''
  const sections = boardDocuments(now, { host, talks })
  const documents = await writeBoard(prisma, congregationId, templateIds, {
    sections,
    congregation: congregation.name,
    uploadedById: adminAccount,
    now,
    sharedFiles: options.sharedBoardFiles,
  })
  log(`  ✓ ${sections.length} board sections, ${documents} documents with their PDF`)

  if (options.demoLogins) {
    const logins = await writeDemoLogins(
      prisma,
      congregationId,
      { people, holders, members, accounts },
      {
        password,
        emailSuffix: options.emailSuffix,
        now,
      },
    )
    log(`  ✓ demo logins for ${Object.keys(logins).length} roles`)
  }

  return { accounts, people, holders }
}

/**
 * The publisher a visitor tries the demo as: a baptized brother with no appointment, with a territory in hand and the
 * most coming assignments, so his dashboard shows what a publisher gets.
 */
async function busiestPublisher(
  prisma: PrismaClient,
  congregationId: number,
  demo: { people: Congregation; members: number[]; holders: Map<string, number[]> },
  now: Date,
): Promise<number | undefined> {
  const candidates = demo.people.people.filter(
    person =>
      // A brother or a sister: in the demo, every brother with a login serves somewhere.
      person.baptismDate != null &&
      // One who already signs in: a young publisher without an address would get a login with an empty one.
      person.hasAccount &&
      person.email !== '' &&
      !person.isHelder &&
      !person.isServant &&
      person.leftAt == null &&
      !person.goesInactive &&
      !person.anonymized,
  )
  const memberOf = (key: number) => demo.members[key] as number
  const ids = candidates.map(person => memberOf(person.key))
  const [parts, territories] = await Promise.all([
    prisma.eventPart.groupBy({
      by: ['assigneeId'],
      where: { congregationId, assigneeId: { in: ids }, event: { startDate: { gte: now } } },
      _count: { _all: true },
    }),
    prisma.attribution.findMany({
      where: { congregationId, publisherId: { in: ids }, endDate: null },
      select: { publisherId: true },
    }),
  ])
  const coming = new Map(parts.map(row => [row.assigneeId, row._count._all]))
  const holding = new Set(territories.map(row => row.publisherId))
  const keys = candidates.map(person => person.key)
  return rankDemoPublishers(keys, {
    // No role, and no group to lead or assist either.
    roles: new Set([
      ...[...demo.holders.values()].flat(),
      ...demo.people.groups.flatMap(group => [group.responsible, group.deputy ?? []].flat()),
    ]),
    holding: new Set(keys.filter(key => holding.has(memberOf(key)))),
    coming: new Map(keys.map(key => [key, coming.get(memberOf(key)) ?? 0])),
  })[0]
}

/**
 * The demo's publisher holds no role, and in the demo the sisters who do have no coming part: she takes the student's
 * place in a demonstration of the next three weeks given to a sister, so her home page lists an assignment. Nothing
 * when she already has one then, or when every demonstration falls in one of her absences.
 */
async function giveStudentPart(prisma: PrismaClient, congregationId: number, memberId: number, now: Date) {
  // The home page lists the next four weeks of released programmes; a copy lives a day at most once seeded.
  const soon = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000)
  const coming = { event: { startDate: { gte: now, lte: soon }, status: 'released' } }
  const already = await prisma.eventPart.count({
    where: { congregationId, ...coming, OR: [{ assigneeId: memberId }, { assistantId: memberId }] },
  })
  if (already > 0) return
  const [parts, absences] = await Promise.all([
    prisma.eventPart.findMany({
      where: {
        congregationId,
        ...coming,
        preset: { key: PartPresetKey.SchoolDemonstration },
        assignee: { isMale: false },
        assistantId: { not: memberId },
      },
      select: { id: true, event: { select: { startDate: true, status: true } } },
    }),
    prisma.absence.findMany({ where: { congregationId, memberId }, select: { startDate: true, endDate: true } }),
  ])
  const id = pickStudentPart(
    parts.map(part => ({ id: part.id, startDate: part.event.startDate, published: part.event.status === 'released' })),
    absences,
  )
  if (id != null) await prisma.eventPart.update({ where: { id }, data: { assigneeId: memberId } })
}

/**
 * The person each demo role signs in as: the committee's coordinator and secretary, the elder in charge of the midweek
 * meeting, the territory servant (never a group overseer), a group overseer who holds none of those roles, and the
 * busiest publisher holding no role. Each gets a login if he has none; the map is kept in `demoAccounts`.
 */
async function writeDemoLogins(
  prisma: PrismaClient,
  congregationId: number,
  demo: {
    people: Congregation
    holders: Map<string, number[]>
    members: number[]
    accounts: Map<number, number>
  },
  login: { password: string; emailSuffix?: string; now: Date },
): Promise<Record<DemoRole, number>> {
  const { people, holders } = demo
  const publisher = await busiestPublisher(prisma, congregationId, demo, login.now)
  const persons: Record<DemoRole, number | undefined> = { ...demoRolePersons(people, holders), publisher }
  const logins = {} as Record<DemoRole, number>
  for (const role of DEMO_ROLES) {
    const person = persons[role]
    if (person == null) throw new Error(`The demo has nobody for the role ${role}`)
    let account = demo.accounts.get(person)
    if (account == null) {
      const seed = people.people[person] as (typeof people.people)[number]
      const row = await prisma.userAccount.create({
        data: {
          memberId: demo.members[person] as number,
          email: loginEmail(seed.email, login.emailSuffix),
          password: login.password,
          active: true,
          emailVerifiedAt: login.now,
          congregationId,
        },
        select: { id: true },
      })
      account = row.id
      demo.accounts.set(person, account)
    }
    logins[role] = account
  }
  // The banner names a visitor's role from their login: two roles on one login would name the wrong one.
  if (new Set(Object.values(logins)).size !== DEMO_ROLES.length) throw new Error('Two demo roles share a login')
  await prisma.setting.create({ data: { key: DEMO_ACCOUNTS_SETTING, value: JSON.stringify(logins), congregationId } })
  // Signing in as a role goes straight in: no address to verify, no consent to give. The data is invented and nobody's.
  await prisma.userAccount.updateMany({
    where: { id: { in: Object.values(logins) }, emailVerifiedAt: null },
    data: { emailVerifiedAt: login.now },
  })
  await prisma.consentRecord.createMany({
    data: Object.values(logins).map(userId => ({
      userId,
      congregationId,
      purpose: ConsentPurpose.DataProcessing,
      consentVersion: CONSENT_VERSION,
    })),
  })
  if (publisher != null) await giveStudentPart(prisma, congregationId, demo.members[publisher] as number, login.now)
  return logins
}
