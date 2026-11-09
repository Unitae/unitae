import { type FileUpload, parseFormData } from '@mjackson/form-data-parser'
import { MAX_FILE_SIZE_BYTES } from '~/features/display-board/server/file-validation.server'

/**
 * A board document form posted as multipart: its fields, and the PDF in `document` if one was chosen.
 * An empty file field, as an edit that keeps the current file sends, gives no file. Throws
 * `MaxFileSizeExceededError` past the size limit.
 */
export async function parseBoardUpload(request: Request): Promise<{ form: FormData; file: File | null }> {
  // Filled in by the handler: a holder, as TypeScript cannot see a closure assign a local.
  const uploaded: { file: File | null } = { file: null }
  const handler = async (upload: FileUpload) => {
    if (upload.fieldName !== 'document') return
    const chunks: Uint8Array[] = []
    const reader = upload.stream().getReader()
    for (let result = await reader.read(); !result.done; result = await reader.read()) chunks.push(result.value)
    uploaded.file = new File(chunks as BlobPart[], upload.name, { type: upload.type })
    return uploaded.file
  }

  const form = await parseFormData(request, { maxFileSize: MAX_FILE_SIZE_BYTES }, handler)
  const { file } = uploaded
  return { form, file: file != null && file.size > 0 ? file : null }
}
