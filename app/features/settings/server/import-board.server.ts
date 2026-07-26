import type JsZip from 'jszip'
import type { TransactionClient } from '~/shared/infra/db.server'
import { buildStorageKey, uploadFile } from '~/shared/infra/file-storage.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

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
  }>(zip, 'board-dynamic-document-settings')

  for (const record of records) {
    const sectionId = idMap.getOptional('board-sections', record.sectionId)
    if (!sectionId) continue

    // Upsert by (congregationId, dynamicType, dynamicRef)
    const existing = await db.boardDynamicDocumentSettings.findFirst({
      where: { dynamicType: record.dynamicType, dynamicRef: record.dynamicRef, congregationId },
    })

    const data = {
      title: record.title,
      sectionId,
      order: record.order,
      visibleFrom: record.visibleFrom ? new Date(record.visibleFrom) : null,
      visibleUntil: record.visibleUntil ? new Date(record.visibleUntil) : null,
      isHighlighted: record.isHighlighted,
      showServices: record.showServices,
    }

    if (existing) {
      await db.boardDynamicDocumentSettings.update({
        where: { id_congregationId: { id: existing.id, congregationId } },
        data,
      })
      idMap.set('board-dynamic-document-settings', record.id, existing.id)
    } else {
      const created = await db.boardDynamicDocumentSettings.create({
        data: {
          ...data,
          dynamicType: record.dynamicType,
          dynamicRef: record.dynamicRef,
          congregationId,
        },
      })
      idMap.set('board-dynamic-document-settings', record.id, created.id)
    }
  }
}
