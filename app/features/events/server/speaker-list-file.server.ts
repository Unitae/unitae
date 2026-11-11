import { ValidationError } from '~/shared/errors/app-error.server'
import { buildStorageKey, deleteFileFromStorage, getFile, uploadFile } from '~/shared/infra/file-storage.server'

// The PDF of a congregation's latest list of speakers, kept so its source can be checked later. One per congregation:
// a new list replaces it.

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-
export const MAX_SPEAKER_LIST_BYTES = 10 * 1024 * 1024

export class SpeakerListFileError extends ValidationError {
  constructor(readonly reason: 'invalid' | 'too_large') {
    super('file', `Speaker list file refused: ${reason}`)
  }
}

async function assertPdf(file: File): Promise<void> {
  if (file.type !== 'application/pdf') throw new SpeakerListFileError('invalid')
  if (file.size > MAX_SPEAKER_LIST_BYTES) throw new SpeakerListFileError('too_large')
  const head = new Uint8Array(await file.slice(0, PDF_MAGIC.length).arrayBuffer())
  if (head.length < PDF_MAGIC.length || PDF_MAGIC.some((byte, index) => head[index] !== byte)) {
    throw new SpeakerListFileError('invalid')
  }
}

/** Checks the file is a PDF of reasonable size, stores it, and returns its storage key. */
export async function storeSpeakerListPdf(congregationId: number, file: File): Promise<string> {
  await assertPdf(file)
  const key = buildStorageKey(congregationId, 'external-speakers', `${crypto.randomUUID()}.pdf`)
  await uploadFile(key, await file.arrayBuffer(), 'application/pdf')
  return key
}

export function getSpeakerListPdf(key: string) {
  return getFile(key)
}

export function removeSpeakerListPdf(key: string): Promise<void> {
  return deleteFileFromStorage(key)
}
