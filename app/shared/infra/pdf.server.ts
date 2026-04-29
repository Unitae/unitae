import type { DocumentProps } from '@react-pdf/renderer'
import { pdf } from '@react-pdf/renderer'
import type { ReactElement } from 'react'

export async function renderPdfResponse(document: ReactElement<DocumentProps>, filename: string): Promise<Response> {
  const blob = await pdf(document).toBlob()

  return new Response(blob, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
