import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import logger from './logger.server'

const useS3 = Boolean(process.env.S3_ENDPOINT)
const LOCAL_STORAGE_ROOT = path.resolve(process.env.UNITAE_STORAGE_PATH ?? 'content/uploads')

// --- S3 driver (lazy-loaded to avoid import errors when not used) ---

async function getS3Client() {
  const { S3Client } = await import('@aws-sdk/client-s3')
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'auto',
    credentials:
      process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
          }
        : undefined,
    forcePathStyle: true,
  })
}

const BUCKET = process.env.S3_BUCKET ?? 'unitae'

async function s3Upload(key: string, body: ArrayBuffer | Buffer | Uint8Array, contentType: string): Promise<void> {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3')
  const s3 = await getS3Client()
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body instanceof ArrayBuffer ? new Uint8Array(body) : body,
      ContentType: contentType,
    }),
  )
}

async function s3GetFile(key: string): Promise<{ body: ReadableStream; contentType: string } | null> {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3')
  const s3 = await getS3Client()
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
    if (!response.Body) return null
    return {
      body: response.Body.transformToWebStream(),
      contentType: response.ContentType ?? 'application/octet-stream',
    }
  } catch (error: unknown) {
    const code = (error as { name?: string })?.name
    if (code === 'NoSuchKey' || code === 'NotFound') return null
    throw error
  }
}

async function s3GetFileBuffer(key: string): Promise<Buffer | null> {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3')
  const s3 = await getS3Client()
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
    if (!response.Body) return null
    const bytes = await response.Body.transformToByteArray()
    return Buffer.from(bytes)
  } catch (error: unknown) {
    const code = (error as { name?: string })?.name
    if (code === 'NoSuchKey' || code === 'NotFound') return null
    throw error
  }
}

async function s3Delete(key: string): Promise<void> {
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
  const s3 = await getS3Client()
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  } catch (error) {
    logger.error(`Failed to delete file from S3: ${key}`, { error })
  }
}

// --- Local filesystem driver ---

function localPath(key: string): string {
  return path.join(LOCAL_STORAGE_ROOT, key)
}

function metaPath(key: string): string {
  return `${localPath(key)}.meta`
}

async function localUpload(key: string, body: ArrayBuffer | Buffer | Uint8Array, contentType: string): Promise<void> {
  const filePath = localPath(key)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const buffer = body instanceof ArrayBuffer ? Buffer.from(body) : Buffer.from(body)
  await fs.writeFile(filePath, buffer)
  await fs.writeFile(metaPath(key), contentType, 'utf-8')
}

async function localGetFile(key: string): Promise<{ body: ReadableStream; contentType: string } | null> {
  const filePath = localPath(key)
  try {
    await fs.access(filePath)
  } catch {
    return null
  }

  let contentType = 'application/octet-stream'
  try {
    contentType = await fs.readFile(metaPath(key), 'utf-8')
  } catch {
    // Pas de fichier .meta, on utilise le type par défaut
  }

  const nodeStream = Readable.toWeb(Readable.from(await fs.readFile(filePath))) as ReadableStream
  return { body: nodeStream, contentType }
}

async function localGetFileBuffer(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(localPath(key))
  } catch {
    return null
  }
}

async function localDelete(key: string): Promise<void> {
  try {
    await fs.unlink(localPath(key))
  } catch (error) {
    logger.error(`Failed to delete local file: ${key}`, { error })
  }
  try {
    await fs.unlink(metaPath(key))
  } catch {
    // Le fichier .meta peut ne pas exister
  }
}

// --- Public API (delegates to active driver) ---

export function uploadFile(key: string, body: ArrayBuffer | Buffer | Uint8Array, contentType: string): Promise<void> {
  return useS3 ? s3Upload(key, body, contentType) : localUpload(key, body, contentType)
}

export function getFile(key: string): Promise<{ body: ReadableStream; contentType: string } | null> {
  return useS3 ? s3GetFile(key) : localGetFile(key)
}

export function getFileBuffer(key: string): Promise<Buffer | null> {
  return useS3 ? s3GetFileBuffer(key) : localGetFileBuffer(key)
}

export function deleteFileFromStorage(key: string): Promise<void> {
  return useS3 ? s3Delete(key) : localDelete(key)
}

export function buildStorageKey(congregationId: number, feature: string, filename: string): string {
  return `${congregationId}/${feature}/${filename}`
}
