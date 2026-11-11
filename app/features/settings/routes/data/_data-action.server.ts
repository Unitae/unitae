import { parseWithZod } from '@conform-to/zod/v4'
import { type FileUpload, parseFormData } from '@mjackson/form-data-parser'
import { redirect } from 'react-router'
import { exportOptionsSchema } from '~/features/settings/schemas/data-transfer.schema'
import { dataTransferQueue } from '~/features/settings/server/data-transfer-queue.server'
import { validateImport } from '~/features/settings/server/import-congregation.server'
import { isOwnedImportKey } from '~/features/settings/server/import-storage-key.server'
import * as m from '~/i18n/paraglide/messages'
import { buildStorageKey, uploadFile } from '~/shared/infra/file-storage.server'
import { createLogger } from '~/shared/infra/logger.server'
import { redirectWithToast } from '../_toast.server'

const logger = createLogger('settings-data')

// 500 MB max for import archives
const MAX_IMPORT_SIZE = 500 * 1024 * 1024
const ARCHIVE_ID = /^[0-9a-f-]{36}$/

/** Where an uploaded archive is kept: only an id the server minted, inside the congregation's own folder. */
export function importStorageKey(congregationId: number, archive: string | null): string | null {
  if (archive == null || !ARCHIVE_ID.test(archive)) return null
  const key = buildStorageKey(congregationId, 'imports', `${archive}.unitae`)
  return isOwnedImportKey(congregationId, key) ? key : null
}

interface DataActor {
  id: number
  congregationId: number
  canExport: boolean
  canImport: boolean
}

/** Starts an export; reads an uploaded archive; starts the import of an archive read before. */
export async function handleDataAction(request: Request, actor: DataActor): Promise<Response> {
  if (request.headers.get('Content-Type')?.startsWith('multipart/form-data')) {
    if (!actor.canImport) throw redirect('/settings/data')
    return uploadArchive(request, actor)
  }

  const formData = await request.formData()
  const intent = formData.get('intent')

  if (intent === 'export' && actor.canExport) {
    const submission = parseWithZod(formData, { schema: exportOptionsSchema })
    if (submission.status !== 'success') throw redirect('/settings/data')
    const job = await dataTransferQueue.add(
      'export',
      {
        type: 'export',
        congregationId: actor.congregationId,
        userId: actor.id,
        options: { includeFiles: submission.value.includeFiles, includeAuditLogs: submission.value.includeAuditLogs },
      },
      { jobId: crypto.randomUUID() },
    )
    return redirect(`/settings/data?export=${job.id}`)
  }

  if (intent === 'confirm-import' && actor.canImport) {
    // The archive id comes back from the form: only a key this congregation could have minted is accepted.
    const storageKey = importStorageKey(actor.congregationId, formData.get('archive') as string | null)
    if (!storageKey) {
      logger.warn('import confirm: rejected archive not owned by caller', { actorId: actor.id })
      throw redirect('/settings/data')
    }
    const job = await dataTransferQueue.add(
      'import',
      { type: 'import', congregationId: actor.congregationId, userId: actor.id, storageKey },
      { jobId: crypto.randomUUID() },
    )
    return redirect(`/settings/data?importJob=${job.id}`)
  }

  throw redirect('/settings/data')
}

/**
 * Keeps the uploaded archive and reads it once, so a broken file is refused at once. The page then opens on what it
 * holds, from the archive's id alone: the summary, which lists people's addresses, never travels in the address.
 */
async function uploadArchive(request: Request, actor: DataActor): Promise<Response> {
  let uploaded: File | null = null
  await parseFormData(request, { maxFileSize: MAX_IMPORT_SIZE }, async (fileUpload: FileUpload) => {
    if (fileUpload.fieldName !== 'archive') return
    const chunks: Uint8Array[] = []
    const reader = fileUpload.stream().getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    uploaded = new File([new Blob(chunks as BlobPart[], { type: fileUpload.type })], fileUpload.name, {
      type: fileUpload.type,
    })
    return uploaded
  })
  const file = uploaded as File | null
  if (!file || !file.name.endsWith('.unitae')) {
    return redirectWithToast(request, '/settings/data', m.import_invalid_file(), 'error')
  }

  const archive = crypto.randomUUID()
  const storageKey = buildStorageKey(actor.congregationId, 'imports', `${archive}.unitae`)
  const buffer = Buffer.from(await file.arrayBuffer())
  await uploadFile(storageKey, buffer, 'application/zip')
  logger.info('Import archive uploaded', { storageKey, size: buffer.length })

  try {
    await validateImport(storageKey, actor.congregationId)
  } catch (error) {
    logger.error('Import validation failed', { error })
    return redirectWithToast(request, '/settings/data', m.import_invalid_file(), 'error')
  }
  return redirect(`/settings/data?import=${archive}`)
}
