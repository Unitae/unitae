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

/**
 * Thrown when a storage key resolves outside the storage root (path traversal
 * or absolute-path injection). A distinct type — not a generic `Error` — so
 * callers and error tracking can tell a security-relevant containment breach
 * apart from an ordinary IO failure (`instanceof` / `code`) instead of
 * string-matching the message. Deliberately not an `AppError`: it must not map
 * to a friendly 4xx that would confirm the probe — an unhandled 500 is correct.
 */
export class StorageKeyError extends Error {
  readonly code = 'STORAGE_KEY_OUTSIDE_ROOT'

  constructor(key: string) {
    super(`Invalid storage key: resolves outside storage root: ${key}`)
    this.name = 'StorageKeyError'
  }
}

function localPath(key: string): string {
  // Resolve (normalising any `..`) and assert the result stays within the
  // storage root — blocks path traversal and absolute-path injection. This is
  // a defense-in-depth backstop; callers handling untrusted keys should reject
  // them earlier (e.g. isOwnedImportKey in the import flow). The `+ path.sep`
  // is load-bearing: a bare startsWith would also accept a sibling like
  // `${LOCAL_STORAGE_ROOT}-evil`.
  const resolved = path.resolve(LOCAL_STORAGE_ROOT, key)
  if (resolved !== LOCAL_STORAGE_ROOT && !resolved.startsWith(LOCAL_STORAGE_ROOT + path.sep)) {
    throw new StorageKeyError(key)
  }
  return resolved
}

/**
 * Resolves the on-disk path for a key, logging and returning `null` when the
 * key is rejected by the containment guard. Keeps the read/delete paths uniform
 * so a traversal probe reaching the storage layer directly always leaves a
 * trace (the route layer rejects earlier, but this is the backstop) instead of
 * being swallowed as a silent not-found.
 */
function safeLocalPath(key: string, operation: string): string | null {
  try {
    return localPath(key)
  } catch (error) {
    if (error instanceof StorageKeyError) {
      logger.warn(`Storage ${operation}: rejected key resolving outside root: ${key}`, { error })
      return null
    }
    throw error
  }
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT'
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
  const filePath = safeLocalPath(key, 'read')
  if (filePath === null) return null

  try {
    await fs.access(filePath)
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }

  let contentType = 'application/octet-stream'
  try {
    contentType = await fs.readFile(`${filePath}.meta`, 'utf-8')
  } catch {
    // Pas de fichier .meta, on utilise le type par défaut
  }

  const nodeStream = Readable.toWeb(Readable.from(await fs.readFile(filePath))) as ReadableStream
  return { body: nodeStream, contentType }
}

async function localGetFileBuffer(key: string): Promise<Buffer | null> {
  const filePath = safeLocalPath(key, 'read')
  if (filePath === null) return null

  try {
    return await fs.readFile(filePath)
  } catch (error) {
    // A genuine missing file is a normal not-found; anything else (EACCES,
    // EISDIR, corruption) is surfaced rather than hidden as a null.
    if (isNotFound(error)) return null
    throw error
  }
}

async function localDelete(key: string): Promise<void> {
  const filePath = safeLocalPath(key, 'delete')
  if (filePath === null) return

  try {
    await fs.unlink(filePath)
  } catch (error) {
    if (!isNotFound(error)) {
      logger.error(`Failed to delete local file: ${key}`, { error })
    }
  }
  try {
    await fs.unlink(`${filePath}.meta`)
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
