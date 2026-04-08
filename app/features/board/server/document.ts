import type { BoardDocument } from '~/database/generated/client'
import logger from '~/shared/libs/logger.server'
import { deleteBoardFile, getBoardFile, getBoardFileBuffer, saveBoardFile } from './document-storage'

export function saveFile(file: File): Promise<string> {
  return saveBoardFile(file)
}

export async function getFileStream(document: BoardDocument): Promise<Response | null> {
  const key = document.uri ?? ''
  const file = await getBoardFile(key)
  if (!file) return null

  return new Response(file.body, {
    status: 200,
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `inline; filename="${document.title}.pdf"`,
    },
  })
}

export async function getFileUrl(document: BoardDocument): Promise<string> {
  const key = document.uri ?? ''
  const fileBuffer = await getBoardFileBuffer(key)
  if (!fileBuffer) {
    throw new Error(`File not found: ${key}`)
  }
  const data = fileBuffer.toString('base64')
  return `data:application/pdf;base64,${data}`
}

export async function deleteFile(document: BoardDocument): Promise<void> {
  const key = document.uri ?? ''
  try {
    await deleteBoardFile(key)
  } catch (error) {
    logger.error(`Failed to delete board document file: ${key}`, { error })
  }
}
