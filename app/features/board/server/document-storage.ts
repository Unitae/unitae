import {
  buildStorageKey,
  deleteFileFromStorage,
  getFile,
  getFileBuffer,
  uploadFile,
} from '~/shared/libs/file-storage.server'

export function getStorageKey(congregationId: number): string {
  const uuid = crypto.randomUUID()
  return buildStorageKey(congregationId, 'board', `${uuid}.pdf`)
}

export async function saveBoardFile(congregationId: number, file: File): Promise<string> {
  const key = getStorageKey(congregationId)
  const buffer = await file.arrayBuffer()
  await uploadFile(key, buffer, file.type || 'application/pdf')
  return key
}

export function getBoardFile(key: string): Promise<{ body: ReadableStream; contentType: string } | null> {
  return getFile(key)
}

export function getBoardFileBuffer(key: string): Promise<Buffer | null> {
  return getFileBuffer(key)
}

export async function deleteBoardFile(key: string): Promise<void> {
  await deleteFileFromStorage(key)
}

export function getThumbnailStorageKey(congregationId: number): string {
  const uuid = crypto.randomUUID()
  return buildStorageKey(congregationId, 'board', `${uuid}.thumb.png`)
}

export async function saveThumbnailFile(congregationId: number, buffer: Buffer): Promise<string> {
  const key = getThumbnailStorageKey(congregationId)
  await uploadFile(key, buffer, 'image/png')
  return key
}
