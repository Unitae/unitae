import { PrismaPg } from '@prisma/adapter-pg'
import JsZip from 'jszip'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { PublisherType } from '~/shared/types/publisher-type'
import { EntityIdMap, type ManifestJson } from './data-transfer.type'

// --- Test DB setup (same pattern as db.server.integration.test.ts) ---

const adapter = new PrismaPg({
  connectionString: process.env.DB_URL,
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
let adminRoleId: number

beforeAll(async () => {
  const adminRole = await testDb.userRole.findFirst({ where: { key: 'admin' } })
  if (!adminRole) throw new Error('UserRole "admin" not found — run pnpm prisma db seed first')
  adminRoleId = adminRole.id

  const source = await testDb.congregation.create({
    data: { name: `Source ${ts}`, slug: `source-${ts}`, active: true },
  })
  sourceId = source.id

  await withScope(sourceId, async tx => {
    const alice = await tx.user.create({
      data: {
        email: `alice-${ts}@test.com`,
        password: 'hashed-password',
        firstname: 'Alice',
        lastname: 'Dupont',
        active: true,
        isPublisher: true,
        type: PublisherType.Normal,
        isMale: false,
        congregationId: sourceId,
      },
    })

    const bob = await tx.user.create({
      data: {
        email: `bob-${ts}@test.com`,
        password: 'hashed-password',
        firstname: 'Bob',
        lastname: 'Martin',
        active: true,
        isPublisher: true,
        type: PublisherType.Normal,
        congregationId: sourceId,
      },
    })

    await tx.congregationUserRole.create({
      data: { userId: alice.id, roleId: adminRoleId, congregationId: sourceId },
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
        publisherId: alice.id,
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
        publisherId: alice.id,
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

    await tx.programmeServiceRoleAssignment.create({
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
  })

  const target = await testDb.congregation.create({
    data: { name: `Target ${ts}`, slug: `target-${ts}`, active: true },
  })
  targetId = target.id
})

afterAll(async () => {
  for (const congId of [sourceId, targetId]) {
    if (!congId) continue
    await withScope(congId, async tx => {
      await tx.programmeServiceRoleAssignment.deleteMany({})
      await tx.programmePartAssignment.deleteMany({})
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
      await tx.territory.deleteMany({})
      await tx.setting.deleteMany({})
      await tx.congregationUserRole.deleteMany({})
      // Clear publisherGroupId FK on users before deleting groups
      await tx.user.updateMany({ data: { publisherGroupId: null } })
      await tx.publisherGroup.deleteMany({})
      await tx.user.deleteMany({})
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
    version: '1.0',
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
  const allRoles = await testDb.userRole.findMany({ select: { id: true, key: true } })
  const roleKeyToId = new Map(allRoles.map(r => [r.key, r.id]))

  await withScope(congregationId, async db => {
    await mod.importSettings(zip, db, congregationId)
    await mod.importEventKinds(zip, db, idMap, congregationId)
    await mod.importUsers(zip, db, idMap, congregationId)
    await mod.importCongregationUserRoles(zip, db, idMap, roleKeyToId, congregationId)
    await mod.importPublisherGroups(zip, db, idMap, congregationId)
    await mod.updateUserPublisherGroups(zip, db, idMap)
    await mod.importPublisherActivities(zip, db, idMap, congregationId)
    await mod.importTerritories(zip, db, idMap, congregationId)
    await mod.importBuildings(zip, db, idMap, congregationId)
    await mod.importBuildingEntrances(zip, db, idMap, congregationId)
    await mod.importBuildingAccesses(zip, db, idMap, congregationId)
    await mod.importBuildingResidentialData(zip, db, idMap, congregationId)
    await mod.importTerritoryEntranceLinks(zip, db, idMap)
    await mod.importBuildingEntranceLinks(zip, db, idMap)
    await mod.importAttributions(zip, db, idMap, congregationId)
    await mod.importProgrammeTemplates(zip, db, idMap, congregationId)
    await mod.importProgrammeTemplateParts(zip, db, idMap, congregationId)
    await mod.importProgrammeTemplateServiceRoles(zip, db, idMap, congregationId)
    await mod.importProgrammeTemplateResponsibles(zip, db, idMap, congregationId)
    await mod.importEvents(zip, db, idMap, congregationId)
    await mod.importProgrammePartAssignments(zip, db, idMap, congregationId)
    await mod.importProgrammeServiceRoleAssignments(zip, db, idMap, congregationId)
    await mod.importBoardSections(zip, db, idMap, congregationId)
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
    expect(manifest.version).toBe('1.0')
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
    expect(entityCounts['congregation-user-roles']).toBe(1)
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

  it('exported roles use key instead of numeric roleId', async () => {
    const { zip } = await exportToZip(sourceId)
    const content = await zip.file('data/congregation-user-roles.ndjson')!.async('string')
    const roles = content
      .split('\n')
      .filter(l => l.trim())
      .map(l => JSON.parse(l))

    expect(roles.length).toBeGreaterThan(0)
    for (const role of roles) {
      expect(role).toHaveProperty('roleKey')
      expect(role).toHaveProperty('userId')
      expect(role).not.toHaveProperty('roleId')
    }
  })

  it('imports into target congregation and recreates all data with new IDs', async () => {
    const { buffer } = await exportToZip(sourceId)

    // Delete source users so the emails are free for import (simulates cross-instance migration)
    await withScope(sourceId, async tx => {
      await tx.programmeServiceRoleAssignment.deleteMany({})
      await tx.programmePartAssignment.deleteMany({})
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
      await tx.territory.deleteMany({})
      await tx.setting.deleteMany({})
      await tx.congregationUserRole.deleteMany({})
      await tx.user.updateMany({ data: { publisherGroupId: null } })
      await tx.publisherGroup.deleteMany({})
      await tx.user.deleteMany({})
    })

    await importFromZip(buffer, targetId)

    await withScope(targetId, async tx => {
      // Users
      const users = await tx.user.findMany({})
      expect(users).toHaveLength(2)
      const alice = users.find(u => u.firstname === 'Alice')!
      const bob = users.find(u => u.firstname === 'Bob')!
      expect(alice.lastname).toBe('Dupont')
      expect(alice.isPublisher).toBe(true)
      expect(alice.password).toBe('$IMPORTED$')
      expect(alice.platformAdmin).toBe(false)

      // Roles
      const roles = await tx.congregationUserRole.findMany({})
      expect(roles).toHaveLength(1)
      expect(roles[0].roleId).toBe(adminRoleId)
      expect(roles[0].userId).toBe(alice.id)

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
      const parts = await tx.programmeTemplatePart.findMany({})
      expect(parts).toHaveLength(1)
      expect(parts[0].templateId).toBe(templates[0].id)
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
    })
  })
})
