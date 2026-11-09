import type { SubmissionResult } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { type FileUpload, MaxFileSizeExceededError, parseFormData } from '@mjackson/form-data-parser'
import type { DisplayWindowInput } from '~/features/display-board/model/display-window'
import { pdfDocumentSchema } from '~/features/display-board/schemas/board-document.schema'
import { MAX_FILE_SIZE_BYTES } from '~/features/display-board/server/file-validation.server'
import * as m from '~/i18n/paraglide/messages'

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

/** What can be wrong with a PDF form beyond its schema, and the field each belongs to. */
export type PdfFormError = 'missing-from' | 'until-before-from' | 'missing-file' | 'invalid-file' | 'invalid-section'

const ERRORS: Record<PdfFormError, { field: string; message: () => string }> = {
  'missing-from': { field: 'from', message: m.board_form_error_missing_from },
  'until-before-from': { field: 'until', message: m.board_form_error_until_before_from },
  'missing-file': { field: 'document', message: m.board_form_file_required },
  'invalid-file': { field: 'document', message: m.board_documents_invalid_file },
  'invalid-section': { field: 'sectionId', message: m.board_form_section_invalid },
}

const fileError = (error: PdfFormError): SubmissionResult<string[]> => ({
  status: 'error',
  error: { [ERRORS[error].field]: [ERRORS[error].message()] },
})

export type PdfForm =
  | { ok: false; reply: SubmissionResult<string[]> }
  | {
      ok: true
      title: string
      sectionId: number
      file: File | null
      /** When it shows, as a reviewer chose it; null for an uploader, whose form never sets it. */
      display: (DisplayWindowInput & { highlighted: boolean }) | null
      /** The answer that puts an error found later on its field, the form's values kept. */
      fail: (error: PdfFormError) => SubmissionResult<string[]>
    }

/**
 * A PDF form as posted, read before any database work: a large upload never holds a transaction open.
 * Its display window is resolved afterwards, once the document's current start is known.
 */
export async function readPdfForm(request: Request, { canReview }: { canReview: boolean }): Promise<PdfForm> {
  let upload: Awaited<ReturnType<typeof parseBoardUpload>>
  try {
    upload = await parseBoardUpload(request)
  } catch (error) {
    if (error instanceof MaxFileSizeExceededError) return { ok: false, reply: fileError('invalid-file') }
    throw error
  }

  const submission = parseWithZod(upload.form, { schema: pdfDocumentSchema })
  if (submission.status !== 'success') return { ok: false, reply: submission.reply() }

  const { title, sectionId, show, from, until, highlighted } = submission.value
  return {
    ok: true,
    title,
    sectionId,
    file: upload.file,
    display: canReview ? { show, from, until, highlighted: highlighted === 'on' } : null,
    fail: error => submission.reply({ fieldErrors: { [ERRORS[error].field]: [ERRORS[error].message()] } }),
  }
}
