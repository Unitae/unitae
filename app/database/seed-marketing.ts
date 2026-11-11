/**
 * Demo seed — fills the demo congregation « Ma Congrégation » with coherent data for screenshots and local QA.
 *
 * Run after the regular seed:
 *   pnpm db:seed:marketing
 *
 * The congregation is generated, not copied: its proportions follow a real congregation of about 110 publishers
 * (`demo/profile.ts`), its people, streets and dates are invented. Everything is relative to today and drawn from a
 * fixed seed, so two runs on the same day write the same congregation. It replaces the demo congregation's data,
 * logins included: every login's password is `demo1234`, and the main one is marc.dupont@demo.unitae.app.
 */
import 'dotenv/config'
import { randomBytes, scrypt } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { EventTemplateKey } from '../features/events/model/event-template.type'
import { PartPresetKey } from '../features/events/model/part-preset.type'
import { normalizeCongregationName } from '../features/events/model/speaker-congregation-name'
import { seedDefaultTemplates } from '../features/events/server/seed-templates.server'
import { seedBuiltInTerritoryKinds } from '../features/territories/server/territory-kinds.server'
import { syncBuiltInRoleAssignments } from '../shared/domain/built-in-roles.server'
import { ensureAdminRole, placeDefaultOrganigram, seedBuiltInRoles } from '../shared/domain/setup.server'
import { generateAttributions, generatePioneers, generateReports } from './demo/history'
import {
  classifyParts,
  generateAbsences,
  generateExternalSpeakers,
  generateMeetings,
  type MeetingKind,
  type PartKind,
  partRoles,
  type TemplateSpec,
} from './demo/meetings'
import { type Congregation, generateCongregation } from './demo/people'
import { generateArea } from './demo/places'
import { BOARD, CUSTOM_ROLES, MEETINGS, SERVICE_ROLES, SETTINGS } from './demo/profile'
import { Random } from './demo/random'
import { assignRoleHolders } from './demo/roles'
import { writeArea, writeAttributions, writeHistory, writePeople } from './demo/write'
import { PrismaClient } from './generated/client'

const adapter = new PrismaPg({ connectionString: process.env.DB_URL })
const prisma = new PrismaClient({ adapter })

/** The demo's random seed: change it for another congregation of the same shape. */
const SEED = 20261110

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
async function cleanCongregationData(congregationId: number) {
  const where = { congregationId }
  await prisma.eventServicePartAllowedRole.deleteMany({ where })
  await prisma.eventPartAllowedRole.deleteMany({ where })
  await prisma.eventServicePart.deleteMany({ where })
  await prisma.eventPart.deleteMany({ where })
  await prisma.templateServicePartAllowedRole.deleteMany({ where })
  await prisma.templatePartAllowedRole.deleteMany({ where })
  await prisma.templateResponsible.deleteMany({ where })
  await prisma.templateServicePart.deleteMany({ where })
  await prisma.templatePart.deleteMany({ where })
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

/** The demo congregation, emptied: the one the regular seed creates in single-tenant mode, or a demo one. */
async function demoCongregation() {
  const defaultCong = await prisma.congregation.findUnique({ where: { slug: 'ma-congregation' } })
  const marketingCong = await prisma.congregation.findUnique({ where: { slug: 'demo-congregation' } })

  // Stale congregations from previous seed versions, and a duplicate demo one.
  const stale = [await prisma.congregation.findUnique({ where: { slug: 'lyon-confluence' } })]
  if (defaultCong && marketingCong) stale.push(marketingCong)
  for (const congregation of stale) {
    if (!congregation) continue
    await cleanCongregationData(congregation.id)
    await prisma.congregation.delete({ where: { id: congregation.id } })
  }

  const existing = defaultCong ?? marketingCong
  if (existing) {
    console.log('  ⤵ Cleaning previous demo data...')
    await cleanCongregationData(existing.id)
  }
  const data = {
    name: 'Ma Congrégation',
    slug: 'demo-congregation',
    displayName: 'Ma Congrégation',
    locale: 'fr',
    timezone: 'Europe/Paris',
  }
  return existing
    ? prisma.congregation.update({ where: { id: existing.id }, data })
    : prisma.congregation.create({ data: { ...data, domain: 'demo.unitae.app' } })
}

async function writeGroups(congregationId: number, congregation: Congregation, members: number[]) {
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
async function arrangeTemplates(congregationId: number, roleIds: Map<string, number>) {
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
      data: SERVICE_ROLES.map(service => ({
        name: service.name,
        key: service.key,
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
    specs.push({
      kind,
      parts: parts.map((part, index) => ({ id: part.id, kind: kinds[index] as PartKind })),
      services: services.map(service => ({ id: service.id, role: serviceRole.get(service.key) as string })),
    })
  }
  return { specs, templateIds }
}

async function writeMeetings(
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
          presetId: template.presetId,
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
      meeting.services.map(service => ({
        name: serviceParts.get(service.templateService)?.name ?? '',
        servicePartId: service.templateService,
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
  return events.length
}

async function writeBoard(congregationId: number, templateIds: Record<MeetingKind, number>) {
  const sections: number[] = []
  for (const [index, section] of BOARD.sections.entries()) {
    const row = await prisma.boardSection.create({ data: { name: section.name, order: index + 1, congregationId } })
    sections.push(row.id)
    await prisma.boardDocument.createMany({
      data: section.documents.map((title, order) => ({
        title,
        sectionId: row.id,
        order: order + 1,
        isHighlighted: index === 0 && order === 0,
        createdAt: new Date(Date.now() - (order + 1) * 9 * 24 * 60 * 60 * 1000),
        congregationId,
      })),
    })
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
}

async function main() {
  console.log('🌱 Demo seed: starting...')
  const now = new Date()
  const random = new Random(SEED)

  const congregation = await demoCongregation()
  const congregationId = congregation.id
  console.log(`  ✓ Congregation "${congregation.name}" (id=${congregationId})`)

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
    data: [...Object.entries(SETTINGS), ['zips', area.zips.join(', ')]].map(([key, value]) => ({
      key: key as string,
      value: value as string,
      congregationId,
    })),
  })

  const password = await hashPassword('demo1234')
  const { members, accounts } = await writePeople(prisma, congregationId, people.people, inactiveAt, password)
  await writeHistory(prisma, congregationId, members, stints, reports)
  // The identity roles (publisher, baptized, pioneer…) follow from each member's flags and enrolments.
  for (const id of members) await syncBuiltInRoleAssignments(prisma, id, congregationId, null)
  await writeGroups(congregationId, people, members)
  console.log(
    `  ✓ ${members.length} people (${accounts.size} logins), ${people.groups.length} groups, ${reports.length} reports`,
  )

  const holders = assignRoleHolders(random, people.people, now, [
    people.admin,
    people.secretary,
    people.serviceOverseer,
  ])
  const roleIds = await writeRoles(congregationId, people, accounts, members, holders)
  console.log(`  ✓ ${CUSTOM_ROLES.length} congregation roles`)

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
  console.log(
    `  ✓ ${territories.length} territories, ${area.buildings.length} buildings, ${attributions.length} attributions`,
  )

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
  const { specs, templateIds } = await arrangeTemplates(congregationId, roleIds)
  const absences = generateAbsences(random, people.people, now)
  const meetings = generateMeetings(random, now, specs, people.people, holders, absences)
  const adminAccount = accounts.get(people.admin) as number
  const meetingCount = await writeMeetings(
    congregationId,
    meetings,
    templateIds,
    members,
    speakerRows.map(row => row.id),
    adminAccount,
  )

  const dayOff = await prisma.eventTemplate.findFirstOrThrow({
    where: { key: EventTemplateKey.DayOff, congregationId },
  })
  await prisma.event.createMany({
    data: absences.map(absence => ({
      name: absence.name,
      startDate: absence.start,
      endDate: absence.end,
      templateId: dayOff.id,
      // Match production: an absence skips the release workflow.
      status: 'released',
      createdById: accounts.get(absence.person) as number,
      congregationId,
    })),
  })
  console.log(`  ✓ ${meetingCount} meetings, ${absences.length} absences, ${speakerRows.length} visiting speakers`)

  await writeBoard(congregationId, templateIds)
  console.log(`  ✓ ${BOARD.sections.length} board sections`)

  console.log('\n✅ Demo seed complete!')
  console.log('   Login: marc.dupont@demo.unitae.app / demo1234')
}

main()
  .catch(error => {
    console.error('❌ Demo seed failed:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
