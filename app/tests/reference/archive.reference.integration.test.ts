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
import { normalise, reference } from '~/tests/fixtures/reference-normalise'

// The congregation exported, then imported into a new, empty one (as the data-transfer round trip does): what the archive carries
// for meetings, and what the new congregation's board and programmes read after the import. Today's archive drops
// the events' status and the board documents' configuration, so the import comes back with every programme a draft —
// pinned here as it is; the fix changes this reference on purpose.

vi.setConfig({ testTimeout: 180_000, hookTimeout: 240_000 })

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
  'attendance',
  'programme-part-assignments',
  'programme-part-assignment-allowed-roles',
  'programme-service-role-assignments',
  'programme-service-role-assignment-allowed-roles',
  'board-dynamic-document-settings',
] as const

let fixture: ReferenceCongregation
let targetId: number

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
})

afterAll(async () => {
  vi.useRealTimers()
  if (fixture) await deleteReferenceCongregation(fixture.congregationId)
  if (targetId) await deleteReferenceCongregation(targetId)
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
  for (const [name, lines] of Object.entries(files)) {
    data?.file(`${name}.ndjson`, lines.map(line => JSON.stringify(line)).join('\n') + (lines.length > 0 ? '\n' : ''))
  }
  return JsZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }))
}

/** The import as `runImport` chains it, for the steps up to meetings and the board. Keep the two in step. */
async function importArchive(zip: JsZip, congregationId: number) {
  const mod = await import('~/features/settings/server/import-congregation.server')
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
    await mod.importEvents(zip, db, idMap, congregationId)
    await mod.importAttendance(zip, db, idMap, congregationId)
    await mod.importEventParts(zip, db, idMap, congregationId)
    await mod.importEventPartAllowedRoles(zip, db, idMap, congregationId)
    await mod.importEventServiceParts(zip, db, idMap, congregationId)
    await mod.importEventServicePartAllowedRoles(zip, db, idMap, congregationId)
    await mod.importBoardSections(zip, db, idMap, congregationId)
    await mod.importBoardDynamicDocumentSettings(zip, db, idMap, congregationId)
  })
}

/** The meeting files, each file's rows sorted by their content once ids are blanked: an archive's row order means nothing. */
function meetingFiles(files: Record<string, unknown[]>) {
  const content = (line: unknown) => JSON.stringify(normalise(line))
  return Object.fromEntries(
    MEETING_FILES.map(name => [
      name,
      files[name] ? [...files[name]].sort((a, b) => content(a).localeCompare(content(b))) : null,
    ]),
  )
}

describe('the archive', () => {
  let exported: Record<string, unknown[]>

  it('carries the same meetings', async () => {
    exported = await exportArchive(fixture.congregationId)

    await expect(reference(meetingFiles(exported), fixture.labels)).toMatchFileSnapshot(
      './__references__/archive-export.json',
    )
  })

  it('imports into a new congregation, which then reads the same', async () => {
    // Logins are unique across the database, and an import usually lands on another instance: renamed here.
    const accounts = (exported['user-accounts'] ?? []).map(line => {
      const account = line as { email?: string }
      return { ...account, email: `imported-${account.email}` }
    })
    await importArchive(await zipOf({ ...exported, 'user-accounts': accounts }), targetId)

    const reimported = await exportArchive(targetId)
    const programmeDocuments = await withScope(targetId, async db => {
      const settings = await db.boardDynamicDocumentSettings.findMany({
        where: { congregationId: targetId },
        orderBy: { order: 'asc' },
      })
      const documents: Record<string, unknown> = {}
      for (const document of settings) {
        documents[document.title] = await getDynamicDocumentData(
          db,
          document.dynamicType,
          document.dynamicRef,
          targetId,
          {
            showServices: document.showServices,
            dynamicConfig: document.dynamicConfig,
            attendance: { timeZone: REFERENCE_TIMEZONE, now: REFERENCE_NOW },
          },
        )
      }
      return documents
    })
    const statuses = await withScope(targetId, db =>
      db.event.groupBy({
        by: ['status'],
        where: { congregationId: targetId },
        _count: true,
        orderBy: { status: 'asc' },
      }),
    )

    await expect(
      reference({ archive: meetingFiles(reimported), eventStatuses: statuses, programmeDocuments }, fixture.labels),
    ).toMatchFileSnapshot('./__references__/archive-after-import.json')
  })
})
