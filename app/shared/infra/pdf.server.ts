import type { DocumentProps } from '@react-pdf/renderer'
import { pdf } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import logger from '~/shared/infra/logger.server'

export function sanitizeFilename(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 50)
}

export async function renderPdfResponse(document: ReactElement<DocumentProps>, filename: string): Promise<Response> {
  let blob: Blob
  try {
    blob = await pdf(document).toBlob()
  } catch (error) {
    logger.error('PDF rendering failed', { error })
    return new Response('PDF generation failed', { status: 500 })
  }

  return new Response(blob, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(blob.size),
      'Cache-Control': 'private, no-store',
    },
  })
}
