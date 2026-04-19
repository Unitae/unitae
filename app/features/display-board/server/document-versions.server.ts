import type { TransactionClient } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { deleteBoardFile } from './document-storage.server'

/**
 * Sauvegarde la version courante du document avant remplacement du fichier.
 */
export async function createVersionFromCurrent(
  db: TransactionClient,
  documentId: number,
  congregationId: number,
  uploadedById: number,
): Promise<void> {
  const document = await db.boardDocument.findUnique({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id: documentId, congregationId },
    },
    select: { uri: true, thumbnailUri: true },
  })

  if (!document?.uri) return

  const lastVersion = await db.boardDocumentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  })

  await db.boardDocumentVersion.create({
    data: {
      documentId,
      uri: document.uri,
      thumbnailUri: document.thumbnailUri,
      versionNumber: (lastVersion?.versionNumber ?? 0) + 1,
      uploadedById,
      congregationId,
    },
  })
}

/**
 * Supprime tous les fichiers stockes des versions d'un document.
 * Les lignes en base sont supprimees par ON DELETE CASCADE.
 */
export async function deleteAllVersionFiles(db: TransactionClient, documentId: number): Promise<void> {
  const versions = await db.boardDocumentVersion.findMany({
    where: { documentId },
    select: { uri: true, thumbnailUri: true },
  })

  for (const version of versions) {
    try {
      await deleteBoardFile(version.uri)
    } catch (error) {
      logger.error(`Failed to delete version file: ${version.uri}`, { error })
    }
    if (version.thumbnailUri) {
      try {
        await deleteBoardFile(version.thumbnailUri)
      } catch (error) {
        logger.error(`Failed to delete version thumbnail: ${version.thumbnailUri}`, { error })
      }
    }
  }
}
