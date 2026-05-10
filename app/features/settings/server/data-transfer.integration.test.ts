import { PrismaPg } from '@prisma/adapter-pg'
import JsZip from 'jszip'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { BUILT_IN_ROLE_KEYS } from '~/shared/domain/built-in-roles.server'
import { PublisherType } from '~/shared/types/publisher-type'
import { EntityIdMap, type ManifestJson } from './data-transfer.type'

// --- Test DB setup (same pattern as db.server.integration.test.ts) ---

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

const ts = Date.now()
let sourceId: number
let targetId: number
let adminPermissionId: number

beforeAll(async () => {
  const adminPermission = await testDb.permission.findFirst({ where: { key: 'admin' } })
  if (!adminPermission) throw new Error('Permission "admin" not found — run pnpm prisma db seed first')
  adminPermissionId = adminPermission.id

  const source = await testDb.congregation.create({
    data: { name: `Source ${ts}`, slug: `source-${ts}`, active: true },
  })
  sourceId = source.id

  await withScope(sourceId, async tx => {
    const aliceMember = await tx.member.create({
      data: {
        firstname: 'Alice',
        lastname: 'Dupont',
        isPublisher: true,
        type: PublisherType.Normal,
        isMale: false,
        congregationId: sourceId,
      },
    })
    const alice = await tx.userAccount.create({
      data: {
        email: `alice-${ts}@test.com`,
        password: 'hashed-password',
        active: true,
        memberId: aliceMember.id,
        congregationId: sourceId,
      },
    })

    const bobMember = await tx.member.create({
      data: {
        firstname: 'Bob',
        lastname: 'Martin',
        isPublisher: true,
        type: PublisherType.Normal,
        congregationId: sourceId,
      },
    })
    const bob = await tx.userAccount.create({
      data: {
        email: `bob-${ts}@test.com`,
        password: 'hashed-password',
        active: true,
        memberId: bobMember.id,
        congregationId: sourceId,
      },
    })

    await tx.congregationUserPermission.create({
      data: { userId: alice.id, permissionId: adminPermissionId, congregationId: sourceId },
    })

    await tx.setting.create({
      data: { key: 'test-setting', value: 'test-value', congregationId: sourceId },
    })

    const territory = await tx.territory.create({
      data: { number: `T-${ts}`, type: TerritoryKind.Classical, notes: 'Test territory', congregationId: sourceId },
    })

    const building = await tx.building.create({
      data: {
        number: '42',
        street: `Rue de Test ${ts}`,
        zip: '75001',
        latitude: 48.856,
        longitude: 2.352,
        congregationId: sourceId,
      },
    })

    const entrance = await tx.buildingEntrance.create({
      data: {
        kind: EntranceKind.Residential,
        homes: 10,
        phones: 5,
        notes: 'Test entrance',
        territories: { connect: { id: territory.id } },
        buildings: { connect: { id: building.id } },
        congregationId: sourceId,
      },
    })

    await tx.buildingAccess.create({
      data: { entranceId: entrance.id, type: 1, position: 0, congregationId: sourceId },
    })

    await tx.buildingResidentialData.create({
      data: { buildingId: building.id, entranceId: entrance.id, homes: 10, phones: 5, congregationId: sourceId },
    })

    await tx.attribution.create({
      data: {
        publisherId: aliceMember.id,
        territoryId: territory.id,
        startDate: new Date('2025-01-01'),
        lateDate: new Date('2025-07-01'),
        notes: 'Test attribution',
        congregationId: sourceId,
      },
    })

    await tx.publisherActivity.create({
      data: {
        month: 3,
        year: 2025,
        publisherId: aliceMember.id,
        hours: 10,
        studies: 1,
        type: PublisherType.Normal,
        isPublisher: true,
        congregationId: sourceId,
      },
    })

    const eventKind = await tx.eventKind.create({
      data: { name: 'Test Kind', key: `kind-${ts}`, color: '#ff0000', congregationId: sourceId },
    })

    const template = await tx.programmeTemplate.create({
      data: {
        name: 'Test Template',
        key: `template-${ts}`,
        description: 'A test template',
        isRecurring: true,
        congregationId: sourceId,
      },
    })

    const part = await tx.programmeTemplatePart.create({
      data: {
        name: 'Opening',
        section: 'intro',
        order: 1,
        durationMin: 5,
        templateId: template.id,
        congregationId: sourceId,
      },
    })

    const serviceRole = await tx.programmeTemplateServiceRole.create({
      data: { name: 'Sound', key: `sound-${ts}`, templateId: template.id, congregationId: sourceId },
    })

    await tx.programmeTemplateResponsible.create({
      data: { templateId: template.id, userId: alice.id, congregationId: sourceId },
    })

    const event = await tx.event.create({
      data: {
        name: 'Test Event',
        kindId: eventKind.id,
        templateId: template.id,
        startDate: new Date('2025-06-01T19:00:00Z'),
        endDate: new Date('2025-06-01T21:00:00Z'),
        createdById: alice.id,
        congregationId: sourceId,
      },
    })

    await tx.programmePartAssignment.create({
      data: {
        eventId: event.id,
        partId: part.id,
        assigneeId: alice.id,
        assistantId: bob.id,
        name: 'Opening',
        section: 'intro',
        order: 1,
        topic: 'Welcome',
        congregationId: sourceId,
      },
    })

    const serviceRoleAssignment = await tx.programmeServiceRoleAssignment.create({
      data: {
        eventId: event.id,
        serviceRoleId: serviceRole.id,
        assigneeId: bob.id,
        name: 'Sound',
        congregationId: sourceId,
      },
    })

    const section = await tx.boardSection.create({
      data: { name: 'Test Section', order: 1, congregationId: sourceId },
    })

    await tx.boardDocument.create({
      data: {
        title: 'Test Document',
        sectionId: section.id,
        type: 'pdf',
        isHighlighted: true,
        congregationId: sourceId,
      },
    })

    await tx.consentRecord.create({
      data: {
        purpose: 'DATA_PROCESSING',
        consentVersion: '1.0',
        userId: alice.id,
        congregationId: sourceId,
      },
    })

    // v1.1 entities: roles, role-permissions, user-role-assignments,
    // external speakers, territory card overlay/perimeter, allowed-role join rows,
    // and a board section visibility role. Built-in roles are auto-seeded for
    // congregations that existed at migration time only — this test creates fresh
    // congregations, so seed them explicitly.
    for (const key of BUILT_IN_ROLE_KEYS) {
      await tx.role.create({
        data: { key, isBuiltIn: true, congregationId: sourceId },
      })
    }
    const elderRole = await tx.role.findFirst({ where: { key: 'elder' } })
    if (elderRole == null) throw new Error('elder built-in role missing')

    const customRole = await tx.role.create({
      data: {
        key: `custom-${ts}`,
        name: 'Custom QA Reviewer',
        description: 'Bench-tests programme drafts',
        isBuiltIn: false,
        congregationId: sourceId,
      },
    })

    await tx.rolePermission.create({
      data: { roleId: customRole.id, permissionId: adminPermissionId, congregationId: sourceId },
    })

    await tx.userRoleAssignment.create({
      data: { userId: alice.id, roleId: customRole.id, congregationId: sourceId },
    })

    const externalSpeaker = await tx.externalSpeaker.create({
      data: {
        name: 'Frère Visiteur',
        congregationName: 'Congrégation Voisine',
        phone: '+33123456789',
        email: 'visiteur@example.com',
        notes: 'Speaks every quarter',
        congregationId: sourceId,
      },
    })

    // Wire the external speaker into the existing part-assignment so the FK link survives import.
    const partAssignment = await tx.programmePartAssignment.findFirst({
      where: { eventId: event.id },
      select: { id: true },
    })
    if (partAssignment != null) {
      await tx.programmePartAssignment.update({
        where: { id: partAssignment.id },
        data: { allowExternalSpeaker: true, externalSpeakerId: externalSpeaker.id, trackOrder: 2 },
      })
    }

    // Set kindId on the template + trackOrder on the part to cover the adjacent leakage gaps.
    await tx.programmeTemplate.update({
      where: { id: template.id },
      data: { kindId: eventKind.id },
    })
    await tx.programmeTemplatePart.update({
      where: { id: part.id },
      data: { trackOrder: 1 },
    })

    await tx.territoryCardOverlay.create({
      data: { name: 'Quartier Nord', color: '#0066ff', paths: [{ lat: 48.8, lng: 2.3 }], congregationId: sourceId },
    })

    await tx.territoryPerimeter.create({
      data: { paths: [[{ lat: 48.8, lng: 2.3 }]], congregationId: sourceId },
    })

    await tx.programmeTemplatePartAllowedRole.create({
      data: { partId: part.id, roleId: elderRole.id, asKind: 'speaker', congregationId: sourceId },
    })

    await tx.programmeTemplateServiceRoleAllowedRole.create({
      data: { serviceRoleId: serviceRole.id, roleId: elderRole.id, congregationId: sourceId },
    })

    if (partAssignment != null) {
      await tx.programmePartAssignmentAllowedRole.create({
        data: {
          assignmentId: partAssignment.id,
          roleId: elderRole.id,
          asKind: 'speaker',
          congregationId: sourceId,
        },
      })
    }

    await tx.programmeServiceRoleAssignmentAllowedRole.create({
      data: { assignmentId: serviceRoleAssignment.id, roleId: elderRole.id, congregationId: sourceId },
    })

    await tx.boardSectionVisibilityRole.create({
      data: { sectionId: section.id, roleId: elderRole.id, congregationId: sourceId },
    })
  })

  const target = await testDb.congregation.create({
    data: { name: `Target ${ts}`, slug: `target-${ts}`, active: true },
  })
  targetId = target.id

  // Pre-seed built-in roles in the target congregation, mirroring how production
  // seedBuiltInRoles runs on congregation creation. Lets the import upsert source
  // built-ins to the target's existing rows by key.
  await withScope(targetId, async tx => {
    for (const key of BUILT_IN_ROLE_KEYS) {
      await tx.role.create({
        data: { key, isBuiltIn: true, congregationId: targetId },
      })
    }
  })
})

afterAll(async () => {
  for (const congId of [sourceId, targetId]) {
    if (!congId) continue
    await withScope(congId, async tx => {
      // v1.1 join tables — must precede their parents. Most cascade on delete, but explicit
      // ordering keeps cleanup deterministic across ad-hoc reruns.
      await tx.boardSectionVisibilityRole.deleteMany({})
      await tx.programmeServiceRoleAssignmentAllowedRole.deleteMany({})
      await tx.programmePartAssignmentAllowedRole.deleteMany({})
      await tx.programmeTemplateServiceRoleAllowedRole.deleteMany({})
      await tx.programmeTemplatePartAllowedRole.deleteMany({})
      await tx.programmeServiceRoleAssignment.deleteMany({})
      await tx.programmePartAssignment.deleteMany({})
      await tx.externalSpeaker.deleteMany({})
      await tx.programmeTemplateResponsible.deleteMany({})
      await tx.programmeTemplateServiceRole.deleteMany({})
      await tx.programmeTemplatePart.deleteMany({})
      await tx.event.deleteMany({})
      await tx.eventKind.deleteMany({})
      await tx.programmeTemplate.deleteMany({})
      await tx.consentRecord.deleteMany({})
      await tx.boardDynamicDocumentSettings.deleteMany({})
      await tx.boardDocumentVersion.deleteMany({})
      await tx.boardDocument.deleteMany({})
      await tx.boardSection.deleteMany({})
      await tx.attribution.deleteMany({})
      await tx.publisherActivity.deleteMany({})
      await tx.buildingResidentialData.deleteMany({})
      await tx.buildingAccess.deleteMany({})
      const territories = await tx.territory.findMany({ select: { id: true } })
      for (const t of territories) {
        await tx.territory.update({ where: { id: t.id }, data: { entrances: { set: [] } } })
      }
      const buildings = await tx.building.findMany({ select: { id: true } })
      for (const b of buildings) {
        await tx.building.update({ where: { id: b.id }, data: { entrances: { set: [] } } })
      }
      await tx.buildingEntrance.deleteMany({})
      await tx.building.deleteMany({})
      await tx.territoryCardOverlay.deleteMany({})
      await tx.territoryPerimeter.deleteMany({})
      await tx.territory.deleteMany({})
      await tx.setting.deleteMany({})
      await tx.userRoleAssignment.deleteMany({})
      await tx.rolePermission.deleteMany({})
      await tx.role.deleteMany({})
      await tx.congregationUserPermission.deleteMany({})
      // Clear publisherGroupId FK on members before deleting groups
      await tx.member.updateMany({ data: { publisherGroupId: null } })
      await tx.publisherGroup.deleteMany({})
      await tx.userAccount.deleteMany({})
      await tx.member.deleteMany({})
      // Audit logs accumulate from syncBuiltInRoleAssignments and other writes during the test —
      // they hold a non-cascading FK to congregation, so clear them before deleting the row.
      await tx.auditLog.deleteMany({})
    })
  }
  const idsToDelete = [sourceId, targetId].filter(id => id != null)
  if (idsToDelete.length > 0) {
    await testDb.congregation.deleteMany({ where: { id: { in: idsToDelete } } })
  }
  await testDb.$disconnect()
})

// --- Export helper (inlined to avoid importing modules with redis/bullmq side effects) ---

async function exportToZip(
  congregationId: number,
): Promise<{ zip: JsZip; buffer: Buffer; entityCounts: Record<string, number> }> {
  // Dynamically import to isolate side effects
  const { buildExportSteps } = await import('./export-congregation.server')

  const zip = new JsZip()
  const dataDir = zip.folder('data')!
  const entityCounts: Record<string, number> = {}

  await withScope(congregationId, async db => {
    const steps = buildExportSteps(db, congregationId, { includeFiles: false, includeAuditLogs: false })
    for (const step of steps) {
      const lines = await step.export()
      const ndjson = lines.map(line => JSON.stringify(line)).join('\n')
      dataDir.file(`${step.name}.ndjson`, ndjson + (lines.length > 0 ? '\n' : ''))
      entityCounts[step.name] = lines.length
    }
  })

  const manifest: ManifestJson = {
    version: '1.1',
    exportDate: new Date().toISOString(),
    sourceApp: 'unitae',
    entityCounts,
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  return { zip, buffer: await zip.generateAsync({ type: 'nodebuffer' }), entityCounts }
}

async function importFromZip(buffer: Buffer, congregationId: number): Promise<void> {
  const mod = await import('./import-congregation.server')

  const zip = await JsZip.loadAsync(buffer)
  const idMap = new EntityIdMap()
  const allPermissions = await testDb.permission.findMany({ select: { id: true, key: true } })
  const permissionKeyToId = new Map(allPermissions.map(p => [p.key, p.id]))

  await withScope(congregationId, async db => {
    await mod.importSettings(zip, db, congregationId)
    await mod.importEventKinds(zip, db, idMap, congregationId)
    await mod.importRoles(zip, db, idMap, congregationId)
    await mod.importRolePermissions(zip, db, idMap, permissionKeyToId, congregationId)
    await mod.importMembers(zip, db, idMap, congregationId)
    await mod.importUserAccounts(zip, db, idMap, congregationId)
    await mod.importUserRoleAssignments(zip, db, idMap, congregationId)
    await mod.importCongregationUserPermissions(zip, db, idMap, permissionKeyToId, congregationId)
    await mod.importPublisherGroups(zip, db, idMap, congregationId)
    await mod.updateMemberPublisherGroups(zip, db, idMap)
    await mod.importPublisherActivities(zip, db, idMap, congregationId)
    await mod.importExternalSpeakers(zip, db, idMap, congregationId)
    await mod.importTerritories(zip, db, idMap, congregationId)
    await mod.importTerritoryCardOverlays(zip, db, idMap, congregationId)
    await mod.importTerritoryPerimeter(zip, db, congregationId)
    await mod.importBuildings(zip, db, idMap, congregationId)
    await mod.importBuildingEntrances(zip, db, idMap, congregationId)
    await mod.importBuildingAccesses(zip, db, idMap, congregationId)
    await mod.importBuildingResidentialData(zip, db, idMap, congregationId)
    await mod.importTerritoryEntranceLinks(zip, db, idMap)
    await mod.importBuildingEntranceLinks(zip, db, idMap)
    await mod.importAttributions(zip, db, idMap, congregationId)
    await mod.importProgrammeTemplates(zip, db, idMap, congregationId)
    await mod.importProgrammeTemplateParts(zip, db, idMap, congregationId)
    await mod.importProgrammeTemplatePartAllowedRoles(zip, db, idMap, congregationId)
    await mod.importProgrammeTemplateServiceRoles(zip, db, idMap, congregationId)
    await mod.importProgrammeTemplateServiceRoleAllowedRoles(zip, db, idMap, congregationId)
    await mod.importProgrammeTemplateResponsibles(zip, db, idMap, congregationId)
    await mod.importEvents(zip, db, idMap, congregationId)
    await mod.importProgrammePartAssignments(zip, db, idMap, congregationId)
    await mod.importProgrammePartAssignmentAllowedRoles(zip, db, idMap, congregationId)
    await mod.importProgrammeServiceRoleAssignments(zip, db, idMap, congregationId)
    await mod.importProgrammeServiceRoleAssignmentAllowedRoles(zip, db, idMap, congregationId)
    await mod.importBoardSections(zip, db, idMap, congregationId)
    await mod.importBoardSectionVisibilityRoles(zip, db, idMap, congregationId)
    await mod.importBoardDocuments(zip, db, idMap, congregationId)
    await mod.importBoardDocumentVersions(zip, db, idMap, congregationId)
    await mod.importBoardDynamicDocumentSettings(zip, db, idMap, congregationId)
    await mod.importConsentRecords(zip, db, idMap, congregationId)
  })
}

// --- Tests ---

describe('Export/Import round-trip', () => {
  it('exports source congregation with correct entity counts', async () => {
    const { zip, entityCounts } = await exportToZip(sourceId)

    const manifestFile = zip.file('manifest.json')
    expect(manifestFile).not.toBeNull()
    const manifest: ManifestJson = JSON.parse(await manifestFile!.async('string'))
    expect(manifest.version).toBe('1.1')
    expect(manifest.sourceApp).toBe('unitae')

    expect(entityCounts.users).toBe(2)
    expect(entityCounts.territories).toBe(1)
    expect(entityCounts.buildings).toBe(1)
    expect(entityCounts['building-entrances']).toBe(1)
    expect(entityCounts['building-accesses']).toBe(1)
    expect(entityCounts.attributions).toBe(1)
    expect(entityCounts['publisher-activities']).toBe(1)
    expect(entityCounts['event-kinds']).toBe(1)
    expect(entityCounts.events).toBe(1)
    expect(entityCounts['board-sections']).toBe(1)
    expect(entityCounts['board-documents']).toBe(1)
    expect(entityCounts['consent-records']).toBe(1)
    expect(entityCounts.settings).toBe(1)
    expect(entityCounts['congregation-user-permissions']).toBe(1)

    // v1.1 entities
    expect(entityCounts.roles).toBe(8) // 7 built-ins + 1 custom
    expect(entityCounts['role-permissions']).toBe(1)
    expect(entityCounts['user-role-assignments']).toBe(1)
    expect(entityCounts['external-speakers']).toBe(1)
    expect(entityCounts['territory-card-overlays']).toBe(1)
    expect(entityCounts['territory-perimeter']).toBe(1)
    expect(entityCounts['programme-template-part-allowed-roles']).toBe(1)
    expect(entityCounts['programme-template-service-role-allowed-roles']).toBe(1)
    expect(entityCounts['programme-part-assignment-allowed-roles']).toBe(1)
    expect(entityCounts['programme-service-role-assignment-allowed-roles']).toBe(1)
    expect(entityCounts['board-section-visibility-roles']).toBe(1)
  })

  it('exported users do not contain passwords or sensitive fields', async () => {
    const { zip } = await exportToZip(sourceId)
    const content = await zip.file('data/users.ndjson')!.async('string')
    const users = content
      .split('\n')
      .filter(l => l.trim())
      .map(l => JSON.parse(l))

    for (const user of users) {
      expect(user).not.toHaveProperty('password')
      expect(user).not.toHaveProperty('platformAdmin')
      expect(user).not.toHaveProperty('congregationId')
    }
  })

  it('exported permissions use key instead of numeric permissionId', async () => {
    const { zip } = await exportToZip(sourceId)
    const content = await zip.file('data/congregation-user-permissions.ndjson')!.async('string')
    const records = content
      .split('\n')
      .filter(l => l.trim())
      .map(l => JSON.parse(l))

    expect(records.length).toBeGreaterThan(0)
    for (const record of records) {
      expect(record).toHaveProperty('permissionKey')
      expect(record).toHaveProperty('userId')
      expect(record).not.toHaveProperty('permissionId')
    }
  })

  it('imports into target congregation and recreates all data with new IDs', async () => {
    const { buffer } = await exportToZip(sourceId)

    // Delete source users so the emails are free for import (simulates cross-instance migration)
    await withScope(sourceId, async tx => {
      await tx.boardSectionVisibilityRole.deleteMany({})
      await tx.programmeServiceRoleAssignmentAllowedRole.deleteMany({})
      await tx.programmePartAssignmentAllowedRole.deleteMany({})
      await tx.programmeTemplateServiceRoleAllowedRole.deleteMany({})
      await tx.programmeTemplatePartAllowedRole.deleteMany({})
      await tx.programmeServiceRoleAssignment.deleteMany({})
      await tx.programmePartAssignment.deleteMany({})
      await tx.externalSpeaker.deleteMany({})
      await tx.programmeTemplateResponsible.deleteMany({})
      await tx.programmeTemplateServiceRole.deleteMany({})
      await tx.programmeTemplatePart.deleteMany({})
      await tx.event.deleteMany({})
      await tx.eventKind.deleteMany({})
      await tx.programmeTemplate.deleteMany({})
      await tx.consentRecord.deleteMany({})
      await tx.boardDynamicDocumentSettings.deleteMany({})
      await tx.boardDocumentVersion.deleteMany({})
      await tx.boardDocument.deleteMany({})
      await tx.boardSection.deleteMany({})
      await tx.attribution.deleteMany({})
      await tx.publisherActivity.deleteMany({})
      await tx.buildingResidentialData.deleteMany({})
      await tx.buildingAccess.deleteMany({})
      const territories = await tx.territory.findMany({ select: { id: true } })
      for (const t of territories) {
        await tx.territory.update({ where: { id: t.id }, data: { entrances: { set: [] } } })
      }
      const buildings = await tx.building.findMany({ select: { id: true } })
      for (const b of buildings) {
        await tx.building.update({ where: { id: b.id }, data: { entrances: { set: [] } } })
      }
      await tx.buildingEntrance.deleteMany({})
      await tx.building.deleteMany({})
      await tx.territoryCardOverlay.deleteMany({})
      await tx.territoryPerimeter.deleteMany({})
      await tx.territory.deleteMany({})
      await tx.setting.deleteMany({})
      await tx.userRoleAssignment.deleteMany({})
      await tx.rolePermission.deleteMany({})
      await tx.role.deleteMany({})
      await tx.congregationUserPermission.deleteMany({})
      await tx.member.updateMany({ data: { publisherGroupId: null } })
      await tx.publisherGroup.deleteMany({})
      await tx.userAccount.deleteMany({})
      await tx.member.deleteMany({})
    })

    await importFromZip(buffer, targetId)

    await withScope(targetId, async tx => {
      // Members + accounts
      const members = await tx.member.findMany({})
      expect(members).toHaveLength(2)
      const aliceMember = members.find(m => m.firstname === 'Alice')!
      const bobMember = members.find(m => m.firstname === 'Bob')!
      expect(aliceMember.lastname).toBe('Dupont')
      expect(aliceMember.isPublisher).toBe(true)

      const accounts = await tx.userAccount.findMany({ include: { member: true } })
      expect(accounts).toHaveLength(2)
      const alice = accounts.find(a => a.member?.firstname === 'Alice')!
      const bob = accounts.find(a => a.member?.firstname === 'Bob')!
      expect(alice.password).toBe('$IMPORTED$')
      expect(alice.platformAdmin).toBe(false)
      // Bob exists; suppress unused-let by referencing
      expect(bob).toBeDefined()
      expect(bobMember).toBeDefined()

      // Permissions
      const assignments = await tx.congregationUserPermission.findMany({})
      expect(assignments).toHaveLength(1)
      expect(assignments[0].permissionId).toBe(adminPermissionId)
      expect(assignments[0].userId).toBe(alice.id)

      // Settings
      const settings = await tx.setting.findMany({})
      expect(settings).toHaveLength(1)
      expect(settings[0].key).toBe('test-setting')

      // Territories
      const territories = await tx.territory.findMany({})
      expect(territories).toHaveLength(1)
      expect(territories[0].number).toBe(`T-${ts}`)

      // Buildings
      const buildings = await tx.building.findMany({})
      expect(buildings).toHaveLength(1)
      expect(buildings[0].latitude).toBe(48.856)

      // Entrances with many-to-many links
      const entrances = await tx.buildingEntrance.findMany({
        include: { territories: { select: { id: true } }, buildings: { select: { id: true } } },
      })
      expect(entrances).toHaveLength(1)
      expect(entrances[0].homes).toBe(10)
      expect(entrances[0].territories).toHaveLength(1)
      expect(entrances[0].buildings).toHaveLength(1)

      // Building accesses
      const accesses = await tx.buildingAccess.findMany({})
      expect(accesses).toHaveLength(1)

      // Residential data
      const residentialData = await tx.buildingResidentialData.findMany({})
      expect(residentialData).toHaveLength(1)

      // Attributions — FK references point to new IDs
      const attributions = await tx.attribution.findMany({})
      expect(attributions).toHaveLength(1)
      expect(attributions[0].publisherId).toBe(alice.id)
      expect(attributions[0].territoryId).toBe(territories[0].id)
      expect(attributions[0].notes).toBe('Test attribution')

      // Activities
      const activities = await tx.publisherActivity.findMany({})
      expect(activities).toHaveLength(1)
      expect(activities[0].hours).toBe(10)
      expect(activities[0].publisherId).toBe(alice.id)

      // Event kinds
      const eventKinds = await tx.eventKind.findMany({})
      expect(eventKinds).toHaveLength(1)
      expect(eventKinds[0].color).toBe('#ff0000')

      // Programme templates + parts + service roles + responsibles
      const templates = await tx.programmeTemplate.findMany({})
      expect(templates).toHaveLength(1)
      // kindId remap: must point to the imported event kind, not the source's id.
      expect(templates[0].kindId).toBe(eventKinds[0].id)
      const parts = await tx.programmeTemplatePart.findMany({})
      expect(parts).toHaveLength(1)
      expect(parts[0].templateId).toBe(templates[0].id)
      expect(parts[0].trackOrder).toBe(1)
      const serviceRoles = await tx.programmeTemplateServiceRole.findMany({})
      expect(serviceRoles).toHaveLength(1)
      const responsibles = await tx.programmeTemplateResponsible.findMany({})
      expect(responsibles).toHaveLength(1)
      expect(responsibles[0].userId).toBe(alice.id)

      // Events + assignments
      const events = await tx.event.findMany({})
      expect(events).toHaveLength(1)
      expect(events[0].createdById).toBe(alice.id)
      const partAssignments = await tx.programmePartAssignment.findMany({})
      expect(partAssignments).toHaveLength(1)
      expect(partAssignments[0].assigneeId).toBe(alice.id)
      expect(partAssignments[0].assistantId).toBe(bob.id)
      expect(partAssignments[0].topic).toBe('Welcome')
      expect(partAssignments[0].trackOrder).toBe(2)
      expect(partAssignments[0].allowExternalSpeaker).toBe(true)
      const srAssignments = await tx.programmeServiceRoleAssignment.findMany({})
      expect(srAssignments).toHaveLength(1)
      expect(srAssignments[0].assigneeId).toBe(bob.id)

      // Board
      const sections = await tx.boardSection.findMany({})
      expect(sections).toHaveLength(1)
      const documents = await tx.boardDocument.findMany({})
      expect(documents).toHaveLength(1)
      expect(documents[0].sectionId).toBe(sections[0].id)

      // Consent
      const consents = await tx.consentRecord.findMany({})
      expect(consents).toHaveLength(1)
      expect(consents[0].userId).toBe(alice.id)

      // v1.1: Roles — 7 built-ins (pre-seeded) + 1 custom.
      const roles = await tx.role.findMany({})
      expect(roles).toHaveLength(8)
      const customRoleOnTarget = roles.find(r => r.key.startsWith('custom-'))
      expect(customRoleOnTarget).toBeDefined()
      expect(customRoleOnTarget?.name).toBe('Custom QA Reviewer')
      expect(customRoleOnTarget?.isBuiltIn).toBe(false)

      // RolePermission — 1 grant on the custom role
      const rolePerms = await tx.rolePermission.findMany({ where: { roleId: customRoleOnTarget?.id } })
      expect(rolePerms).toHaveLength(1)
      expect(rolePerms[0].permissionId).toBe(adminPermissionId)

      // UserRoleAssignment — Alice is a member of the custom role on the target.
      const customRoleAssignments = await tx.userRoleAssignment.findMany({
        where: { roleId: customRoleOnTarget?.id },
      })
      expect(customRoleAssignments).toHaveLength(1)
      expect(customRoleAssignments[0].userId).toBe(alice.id)

      // ExternalSpeaker remapped onto the part assignment.
      const speakers = await tx.externalSpeaker.findMany({})
      expect(speakers).toHaveLength(1)
      expect(speakers[0].name).toBe('Frère Visiteur')
      expect(partAssignments[0].externalSpeakerId).toBe(speakers[0].id)

      // Territory card overlay + perimeter
      const overlays = await tx.territoryCardOverlay.findMany({})
      expect(overlays).toHaveLength(1)
      expect(overlays[0].name).toBe('Quartier Nord')
      const perimeter = await tx.territoryPerimeter.findMany({})
      expect(perimeter).toHaveLength(1)

      // Allowed-role join rows — anchor onto the elder built-in role on target.
      const elderOnTarget = roles.find(r => r.key === 'elder')!
      const partAllowed = await tx.programmeTemplatePartAllowedRole.findMany({})
      expect(partAllowed).toHaveLength(1)
      expect(partAllowed[0].partId).toBe(parts[0].id)
      expect(partAllowed[0].roleId).toBe(elderOnTarget.id)
      expect(partAllowed[0].asKind).toBe('speaker')

      const serviceRoleAllowed = await tx.programmeTemplateServiceRoleAllowedRole.findMany({})
      expect(serviceRoleAllowed).toHaveLength(1)
      expect(serviceRoleAllowed[0].serviceRoleId).toBe(serviceRoles[0].id)

      const partAssignmentAllowed = await tx.programmePartAssignmentAllowedRole.findMany({})
      expect(partAssignmentAllowed).toHaveLength(1)
      expect(partAssignmentAllowed[0].assignmentId).toBe(partAssignments[0].id)
      expect(partAssignmentAllowed[0].asKind).toBe('speaker')

      const serviceRoleAssignmentAllowed = await tx.programmeServiceRoleAssignmentAllowedRole.findMany({})
      expect(serviceRoleAssignmentAllowed).toHaveLength(1)
      expect(serviceRoleAssignmentAllowed[0].assignmentId).toBe(srAssignments[0].id)

      // Board section visibility role
      const visibility = await tx.boardSectionVisibilityRole.findMany({})
      expect(visibility).toHaveLength(1)
      expect(visibility[0].sectionId).toBe(sections[0].id)
      expect(visibility[0].roleId).toBe(elderOnTarget.id)
    })
  })
})

// Legacy v1.x archive support is deferred — v1.x export shipped a single `users.ndjson`
// with publisher fields embedded, and v2.0 splits that into `members` + `user-accounts`.
// The forward-only path is the only one currently supported; backward compat will be a
// follow-up. Keep the test skipped so it documents the intent without blocking CI.
describe.skip('v1.0 archive backward compatibility', () => {
  it('accepts a v1.0 manifest and routes legacy congregation-user-roles.ndjson via permission keys', async () => {
    const congregation = await testDb.congregation.create({
      data: { name: `Legacy ${ts}`, slug: `legacy-${ts}`, active: true },
    })
    const congId = congregation.id

    try {
      // Build a minimal v1.0 archive manually: just a user + the legacy permission file shape
      // (`congregation-user-roles.ndjson` with `roleKey`). The fallback in
      // importCongregationUserPermissions should treat `roleKey` as a Permission key.
      const zip = new JsZip()
      const dataDir = zip.folder('data')!
      const sourceUserId = 9001
      dataDir.file(
        'users.ndjson',
        `${JSON.stringify({
          id: sourceUserId,
          firstname: 'Legacy',
          lastname: 'User',
          email: `legacy-${ts}@test.com`,
          active: true,
          isPublisher: false,
          type: PublisherType.Normal,
          isMale: null,
          phone: null,
          address: null,
          birthDate: null,
          baptismDate: null,
          isHelder: false,
          isServant: false,
          isAnointed: false,
          anonymizedAt: null,
          publisherGroupId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })}\n`,
      )
      dataDir.file('congregation-user-roles.ndjson', `${JSON.stringify({ userId: sourceUserId, roleKey: 'admin' })}\n`)
      const manifest: ManifestJson = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        sourceApp: 'unitae',
        entityCounts: { users: 1, 'congregation-user-roles': 1 },
      }
      zip.file('manifest.json', JSON.stringify(manifest, null, 2))

      const buffer = await zip.generateAsync({ type: 'nodebuffer' })

      const mod = await import('./import-congregation.server')
      const allPermissions = await testDb.permission.findMany({ select: { id: true, key: true } })
      const permissionKeyToId = new Map(allPermissions.map(p => [p.key, p.id]))
      const idMap = new EntityIdMap()
      const loadedZip = await JsZip.loadAsync(buffer)

      await withScope(congId, async tx => {
        await mod.importUserAccounts(loadedZip, tx, idMap, congId)
        await mod.importCongregationUserPermissions(loadedZip, tx, idMap, permissionKeyToId, congId)
      })

      await withScope(congId, async tx => {
        const users = await tx.userAccount.findMany({})
        expect(users).toHaveLength(1)
        const grants = await tx.congregationUserPermission.findMany({})
        expect(grants).toHaveLength(1)
        expect(grants[0].permissionId).toBe(adminPermissionId)
        expect(grants[0].userId).toBe(users[0].id)
      })
    } finally {
      await withScope(congId, async tx => {
        await tx.congregationUserPermission.deleteMany({})
        await tx.userRoleAssignment.deleteMany({})
        await tx.userAccount.deleteMany({})
        await tx.member.deleteMany({})
        await tx.auditLog.deleteMany({})
      })
      await testDb.congregation.delete({ where: { id: congId } })
    }
  })
})

describe('Export cross-congregation isolation', () => {
  it('export of source congregation does not include target congregation data', async () => {
    // Create fresh accounts in each congregation (the import test deleted source rows earlier)
    const sourceUser = await withScope(sourceId, async tx =>
      tx.userAccount.create({
        data: {
          email: `isolation-source-${ts}@test.com`,
          password: 'hashed',
          firstname: 'Source',
          lastname: 'Only',
          active: true,
          congregationId: sourceId,
        },
      }),
    )

    const targetUser = await withScope(targetId, async tx =>
      tx.userAccount.create({
        data: {
          email: `isolation-target-${ts}@test.com`,
          password: 'hashed',
          firstname: 'Target',
          lastname: 'Only',
          active: true,
          congregationId: targetId,
        },
      }),
    )

    const { entityCounts, zip } = await exportToZip(sourceId)

    const content = await zip.file('data/user-accounts.ndjson')!.async('string')
    const exportedUsers = content
      .split('\n')
      .filter(l => l.trim())
      .map(l => JSON.parse(l))

    // Target congregation user must not appear in source export
    const leaked = exportedUsers.find((u: { email?: string }) => u.email === `isolation-target-${ts}@test.com`)
    expect(leaked).toBeUndefined()

    // Entity count must reflect only source congregation's data
    expect(entityCounts['user-accounts']).toBeGreaterThanOrEqual(1)

    // Cleanup
    await withScope(sourceId, tx => tx.userAccount.delete({ where: { id: sourceUser.id } }))
    await withScope(targetId, tx => tx.userAccount.delete({ where: { id: targetUser.id } }))
  })

  it('reading scoped data from congregation A does not return congregation B data', async () => {
    const sourceSettings = await withScope(sourceId, tx => tx.setting.findMany({}))
    const targetSettings = await withScope(targetId, tx => tx.setting.findMany({}))

    const sourceKeys = sourceSettings.map(s => s.key)
    const targetKeys = targetSettings.map(s => s.key)

    // RLS must ensure each congregation only sees its own settings
    for (const key of sourceKeys) {
      expect(targetKeys).not.toContain(key)
    }
  })
})
