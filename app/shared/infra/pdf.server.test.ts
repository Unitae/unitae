import path from 'node:path'
import { Document, Font, Page, Text } from '@react-pdf/renderer'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { readPdf } from '~/tests/helpers/pdf-text'
import { renderPdfResponse } from './pdf.server'

const fonts = path.join(process.cwd(), 'public', 'fonts')
Font.register({ family: 'Fira Sans', src: path.join(fonts, 'FiraSans-Regular.ttf') })
Font.register({ family: 'Source Serif 4', src: path.join(fonts, 'SourceSerif4-Regular.ttf') })

function sheet(text: string, fontFamily = 'Fira Sans') {
  return createElement(
    Document,
    null,
    createElement(Page, { size: 'A4', style: { fontFamily } }, createElement(Text, null, text)),
  )
}

async function printed(response: Response): Promise<string> {
  const [page] = await readPdf(await response.arrayBuffer())
  return page.text
}

describe('renderPdfResponse', () => {
  // Every PDF the server renders shares the same font objects. Writing « Élodie » into a PDF
  // subsets the composite « É », whose « E » component the font then caches without its
  // character: a later PDF printed « ngage » for « Engage ».
  it('keeps every letter of a PDF rendered after one that printed an accented capital', async () => {
    expect(await printed(await renderPdfResponse(sheet('Élodie'), 'first.pdf'))).toBe('Élodie')

    expect(await printed(await renderPdfResponse(sheet('Engage la conversation'), 'second.pdf'))).toBe(
      'Engage la conversation',
    )
  })

  // A glyph several characters share reads back as the first character it was cached with. Source
  // Serif draws the apostrophe ’ and the letter ʼ alike; the PDF must still say « aujourd’hui ».
  it('keeps the common meaning of a glyph several characters share', async () => {
    expect(await printed(await renderPdfResponse(sheet('aujourd’hui', 'Source Serif 4'), 'serif.pdf'))).toBe(
      'aujourd’hui',
    )
  })
})
