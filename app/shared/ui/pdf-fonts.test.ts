import { Document, Page, Text } from '@react-pdf/renderer'
import { createElement as h } from 'react'
import { describe, expect, it } from 'vitest'
import { renderPdfBuffer } from '~/shared/infra/pdf.server'
import { PDF_FONT_FAMILY, registerPdfFonts } from './pdf-fonts'

registerPdfFonts()

describe('registerPdfFonts', () => {
  it('prints Cyrillic with an embedded Fira Sans, in every weight the documents use', async () => {
    const pdf = await renderPdfBuffer(
      h(
        Document,
        null,
        h(
          Page,
          null,
          h(Text, { style: { fontFamily: PDF_FONT_FAMILY } }, 'Олександр Шевченко'),
          h(Text, { style: { fontFamily: PDF_FONT_FAMILY, fontWeight: 500 } }, 'Київ'),
          h(Text, { style: { fontFamily: PDF_FONT_FAMILY, fontWeight: 'bold' } }, 'Харків'),
        ),
      ),
    )

    // The embedded font is named in the file; Helvetica, which has no Cyrillic, never is.
    const text = pdf.toString('latin1')
    expect(text).toContain('FiraSans')
    expect(text).not.toContain('Helvetica')
  })

  it('registers once however many documents ask', () => {
    expect(() => {
      registerPdfFonts()
      registerPdfFonts()
    }).not.toThrow()
  })
})
