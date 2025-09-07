import { congregationContext } from '~/shared/libs/db.server'
import { buildStorageKey, deleteFileFromStorage, getFile, getFileBuffer, uploadFile } from '~/shared/libs/file-storage.server'

function getCongregationId(): number {
  const ctx = congregationContext.getStore()
  return ctx?.congregationId ?? 0
}

export function getStorageKey(filename?: string): string {
  const uuid = crypto.randomUUID()
  return buildStorageKey(getCongregationId(), 'board', `${uuid}.pdf`)
}

export async function saveBoardFile(file: File): Promise<string> {
  const key = getStorageKey()
  const buffer = await file.arrayBuffer()
  await uploadFile(key, buffer, file.type || 'application/pdf')
  return key
}

export async function getBoardFile(key: string): Promise<{ body: ReadableStream; contentType: string } | null> {
  return getFile(key)
}

export async function getBoardFileBuffer(key: string): Promise<Buffer | null> {
  return getFileBuffer(key)
}

export async function deleteBoardFile(key: string): Promise<void> {
  await deleteFileFromStorage(key)
}
