import { Document, Page, Text } from '@react-pdf/renderer'
import { createElement as h } from 'react'
import { describe, expect, it } from 'vitest'
import { renderPdfBuffer } from '~/shared/infra/pdf.server'
import { PDF_FONT_FAMILY, PDF_SERIF_FAMILY, registerPdfFonts } from './pdf-fonts'

registerPdfFonts()

describe('registerPdfFonts', () => {
  it('prints Cyrillic with embedded Fira Sans and Source Serif 4, in every weight the documents use', async () => {
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
          h(Text, { style: { fontFamily: PDF_SERIF_FAMILY } }, 'Шевченко'),
        ),
      ),
    )

    // The embedded fonts are named in the file; Helvetica and Times, which have no Cyrillic, never are.
    const text = pdf.toString('latin1')
    expect(text).toContain('FiraSans')
    expect(text).toContain('SourceSerif4')
    expect(text).not.toContain('Helvetica')
    expect(text).not.toContain('Times')
  })

  it('registers once however many documents ask', () => {
    expect(() => {
      registerPdfFonts()
      registerPdfFonts()
    }).not.toThrow()
  })
})
