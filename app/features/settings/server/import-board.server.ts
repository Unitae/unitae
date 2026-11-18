import type JsZip from 'jszip'
import { Prisma } from '~/database/generated/client'
import {
  DynamicType,
  isDynamicType,
  parseAppearance,
  parseProgrammeDynamicConfig,
} from '~/features/display-board/index.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { buildStorageKey, uploadFile } from '~/shared/infra/file-storage.server'
import { createLogger } from '~/shared/infra/logger.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

const logger = createLogger('import-board')

export async function importBoardSections(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ id: number; name: string; order: number | null }>(zip, 'board-sections')
  for (const record of records) {
    const created = await db.boardSection.create({
      data: { name: record.name, order: record.order, congregationId },
    })
    idMap.set('board-sections', record.id, created.id)
  }
}

export async function importBoardSectionVisibilityRoles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ sectionId: number; roleId: number }>(zip, 'board-section-visibility-roles')
  const data: { sectionId: number; roleId: number; congregationId: number }[] = []

  for (const record of records) {
    const sectionId = idMap.getOptional('board-sections', record.sectionId)
    const roleId = idMap.getOptional('roles', record.roleId)
    if (!sectionId || !roleId) continue
    data.push({ sectionId, roleId, congregationId })
  }

  if (data.length > 0) {
    await db.boardSectionVisibilityRole.createMany({ data, skipDuplicates: true })
  }
}

export async function importBoardDocuments(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    title: string
    uri: string | null
    thumbnailUri: string | null
    sectionId: number
    order: number | null
    type: string | null
    visibleFrom: string | null
    visibleUntil: string | null
    isHighlighted: boolean
    createdAt: string
  }>(zip, 'board-documents')

  for (const record of records) {
    const sectionId = idMap.getOptional('board-sections', record.sectionId)
    if (!sectionId) continue

    // Import associated files if present
    let newUri = record.uri
    let newThumbnailUri = record.thumbnailUri
    if (record.uri) {
      newUri = await importBoardFile(zip, record.uri, congregationId)
    }
    if (record.thumbnailUri) {
      newThumbnailUri = await importBoardFile(zip, record.thumbnailUri, congregationId)
    }

    const created = await db.boardDocument.create({
      data: {
        title: record.title,
        uri: newUri,
        thumbnailUri: newThumbnailUri,
        sectionId,
        order: record.order,
        type: record.type,
        visibleFrom: record.visibleFrom ? new Date(record.visibleFrom) : null,
        visibleUntil: record.visibleUntil ? new Date(record.visibleUntil) : null,
        isHighlighted: record.isHighlighted,
        congregationId,
      },
    })
    idMap.set('board-documents', record.id, created.id)
  }
}

export async function importBoardDocumentVersions(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    documentId: number
    uri: string
    thumbnailUri: string | null
    versionNumber: number
    uploadedById: number | null
    createdAt: string
  }>(zip, 'board-document-versions')

  for (const record of records) {
    const documentId = idMap.getOptional('board-documents', record.documentId)
    if (!documentId) continue

    let newUri = record.uri
    let newThumbnailUri = record.thumbnailUri
    newUri = (await importBoardFile(zip, record.uri, congregationId)) ?? record.uri
    if (record.thumbnailUri) {
      newThumbnailUri = await importBoardFile(zip, record.thumbnailUri, congregationId)
    }

    await db.boardDocumentVersion.create({
      data: {
        documentId,
        uri: newUri,
        thumbnailUri: newThumbnailUri,
        versionNumber: record.versionNumber,
        uploadedById: idMap.getOptional('user-accounts', record.uploadedById),
        congregationId,
      },
    })
  }
}

/**
 * Imports a board file from the ZIP archive to storage.
 * Returns the new storage key, or null if the file is not in the archive.
 */
export async function importBoardFile(zip: JsZip, originalUri: string, congregationId: number): Promise<string | null> {
  const filename = originalUri.split('/').pop()
  if (!filename) return null

  const zipFile = zip.file(`files/board/${filename}`)
  if (!zipFile) return null

  const buffer = await zipFile.async('nodebuffer')
  const contentType = filename.endsWith('.png') ? 'image/png' : 'application/pdf'
  const newKey = buildStorageKey(congregationId, 'board', filename)
  await uploadFile(newKey, buffer, contentType)
  return newKey
}

/**
 * A dynamic document's appearance as the archive carried it, read as its own type reads it: a
 * choice that no longer reads falls back to its default. None at all (a pre-2.9 archive) means the
 * defaults, stored as no appearance.
 */
function importedAppearance(dynamicType: string, appearance: unknown) {
  if (appearance == null || !isDynamicType(dynamicType)) return Prisma.DbNull
  return { ...parseAppearance(dynamicType, appearance) }
}

/**
 * The board's dynamic documents. They have no natural key — several programme documents share a type and an empty
 * ref — so each archived document is created in its imported section, like the sections themselves, never matched to
 * an existing one: importing into a congregation that already has documents adds to them.
 *
 * The configuration travels from v2.16 on: a programme's templates are re-pointed at the imported ones, a template the
 * archive did not bring leaves the list, and a configuration that no longer parses is dropped whole — both said in the
 * log. An older archive carries none, and the document imports without one.
 */
export async function importBoardDynamicDocumentSettings(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    title: string
    dynamicType: string
    dynamicRef: string | null
    sectionId: number
    order: number | null
    visibleFrom: string | null
    visibleUntil: string | null
    isHighlighted: boolean
    showServices: boolean
    // Since v2.9.
    appearance?: unknown
    // Since v2.16.
    dynamicConfig?: unknown
  }>(zip, 'board-dynamic-document-settings')

  for (const record of records) {
    const sectionId = idMap.getOptional('board-sections', record.sectionId)
    if (!sectionId) continue

    const created = await db.boardDynamicDocumentSettings.create({
      data: {
        title: record.title,
        dynamicType: record.dynamicType,
        dynamicRef: record.dynamicRef,
        dynamicConfig: importedConfig(record, idMap, congregationId),
        sectionId,
        order: record.order,
        visibleFrom: record.visibleFrom ? new Date(record.visibleFrom) : null,
        visibleUntil: record.visibleUntil ? new Date(record.visibleUntil) : null,
        isHighlighted: record.isHighlighted,
        showServices: record.showServices,
        appearance: importedAppearance(record.dynamicType, record.appearance),
        congregationId,
      },
    })
    idMap.set('board-dynamic-document-settings', record.id, created.id)
  }
}

/** A document's configuration in the imported congregation: a programme's templates by their new ids. */
function importedConfig(
  record: { title: string; dynamicType: string; dynamicConfig?: unknown },
  idMap: EntityIdMap,
  congregationId: number,
): Prisma.InputJsonValue | undefined {
  const config = record.dynamicConfig
  if (config == null) return undefined
  if (record.dynamicType !== DynamicType.Programme) return config as Prisma.InputJsonValue
  const programme = parseProgrammeDynamicConfig(config)
  if (!programme) {
    logger.warn('Unreadable programme configuration: document imported without one', {
      congregationId,
      title: record.title,
    })
    return undefined
  }
  const templates = programme.templates.flatMap(template => {
    const templateId = idMap.getOptional('programme-templates', template.templateId)
    return templateId == null ? [] : [{ ...template, templateId }]
  })
  const dropped = programme.templates.length - templates.length
  if (dropped > 0) {
    // A template deleted in the source congregation: its id fetched nothing there either.
    const log = templates.length === 0 ? logger.warn : logger.info
    log(`Programme document lost ${dropped} template(s) the archive does not carry`, {
      congregationId,
      title: record.title,
    })
  }
  return { ...programme, templates }
}
