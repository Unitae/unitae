import type { Job } from 'bullmq'
import { unscopedDb } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { saveThumbnailFile } from '../server/document-storage.server'
import { generateThumbnail } from '../server/thumbnail.server'
import type { ThumbnailJobData } from '../server/thumbnail-queue.server'

const logger = createLogger('thumbnail-worker')

export async function handleThumbnailWork(job: Job<ThumbnailJobData>): Promise<void> {
  const { congregationId, documentId, pdfStorageKey } = job.data

  const thumbnailBuffer = await generateThumbnail(pdfStorageKey)
  if (!thumbnailBuffer) {
    logger.warn('Thumbnail generation returned null, skipping', { documentId, pdfStorageKey })
    return
  }

  const thumbnailUri = await saveThumbnailFile(congregationId, thumbnailBuffer)

  await unscopedDb.boardDocument.update({
    where: {
      id_congregationId: { id: documentId, congregationId },
    },
    data: { thumbnailUri },
  })

  logger.info('Thumbnail generated and saved', { documentId, thumbnailUri })
}
