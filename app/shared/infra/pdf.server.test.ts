import path from 'node:path'
import { Document, Font, Page, Text } from '@react-pdf/renderer'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { readPdf } from '~/tests/helpers/pdf-text'
import { renderPdfResponse } from './pdf.server'

Font.register({ family: 'Fira Sans', src: path.join(process.cwd(), 'public', 'fonts', 'FiraSans-Regular.ttf') })

function sheet(text: string) {
  return createElement(
    Document,
    null,
    createElement(Page, { size: 'A4', style: { fontFamily: 'Fira Sans' } }, createElement(Text, null, text)),
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
})
