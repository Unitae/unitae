import { ValidationError } from '~/shared/errors/app-error.server'

const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB
const ALLOWED_MIME_TYPES = ['application/pdf']

export class FileValidationError extends ValidationError {
  constructor(public messageKey: 'invalid_type' | 'invalid_content' | 'file_too_large') {
    super('file', `File validation failed: ${messageKey}`)
  }
}

export async function validateBoardFile(file: File): Promise<void> {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new FileValidationError('invalid_type')
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new FileValidationError('file_too_large')
  }

  const headerSlice = await file.slice(0, PDF_MAGIC_BYTES.length).arrayBuffer()
  const headerBytes = new Uint8Array(headerSlice)

  if (headerBytes.length < PDF_MAGIC_BYTES.length) {
    throw new FileValidationError('invalid_content')
  }

  for (let i = 0; i < PDF_MAGIC_BYTES.length; i++) {
    if (headerBytes[i] !== PDF_MAGIC_BYTES[i]) {
      throw new FileValidationError('invalid_content')
    }
  }
}

export function validateVisibilityDates(visibleFrom: Date | null, visibleUntil: Date | null): boolean {
  if (visibleFrom == null || visibleUntil == null) {
    return true
  }

  if (Number.isNaN(visibleFrom.getTime()) || Number.isNaN(visibleUntil.getTime())) {
    return true
  }

  return visibleUntil.getTime() > visibleFrom.getTime()
}
