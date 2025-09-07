// biome-ignore-all lint/style/useNamingConvention: AWS SDK uses PascalCase properties
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import logger from './logger.server'

const s3 = new S3Client({
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

const BUCKET = process.env.S3_BUCKET ?? 'unitae'

export async function uploadFile(key: string, body: ArrayBuffer | Buffer | Uint8Array, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body instanceof ArrayBuffer ? new Uint8Array(body) : body,
      ContentType: contentType,
    }),
  )
}

export async function getFile(key: string): Promise<{ body: ReadableStream; contentType: string } | null> {
  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
      }),
    )

    if (!response.Body) return null

    return {
      body: response.Body.transformToWebStream(),
      contentType: response.ContentType ?? 'application/octet-stream',
    }
  } catch (error: unknown) {
    const code = (error as { name?: string })?.name
    if (code === 'NoSuchKey' || code === 'NotFound') {
      return null
    }
    throw error
  }
}

export async function getFileBuffer(key: string): Promise<Buffer | null> {
  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
      }),
    )

    if (!response.Body) return null

    const bytes = await response.Body.transformToByteArray()
    return Buffer.from(bytes)
  } catch (error: unknown) {
    const code = (error as { name?: string })?.name
    if (code === 'NoSuchKey' || code === 'NotFound') {
      return null
    }
    throw error
  }
}

export async function deleteFileFromStorage(key: string): Promise<void> {
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
      }),
    )
  } catch (error) {
    logger.error(`Failed to delete file from S3: ${key}`, { error })
  }
}

export function buildStorageKey(congregationId: number, feature: string, filename: string): string {
  return `${congregationId}/${feature}/${filename}`
}
