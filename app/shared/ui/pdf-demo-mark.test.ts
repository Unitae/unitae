import { Document, Page, Text } from '@react-pdf/renderer'
import { createElement as h } from 'react'
import { describe, expect, it } from 'vitest'
import { renderPdfBuffer, renderPdfResponse } from '~/shared/infra/pdf.server'
import { readPdf } from '~/tests/helpers/pdf-text'
import { PdfDemoMark } from './pdf-demo-mark'

function twoPages() {
  return h(
    Document,
    null,
    ['Programme', 'Suite'].map(text => h(Page, { key: text, size: 'A4' }, h(Text, null, text), h(PdfDemoMark))),
  )
}

async function pagesOf(response: Response): Promise<string[]> {
  return (await readPdf(await response.arrayBuffer())).map(page => page.text)
}

// A visitor's demo copy can hold anything they typed: every page it prints says it's a demo.
describe('PdfDemoMark', () => {
  it('marks every page of a PDF rendered for a demo copy', async () => {
    const pages = await pagesOf(await renderPdfResponse(twoPages(), 'demo.pdf', { demo: true }))

    expect(pages).toHaveLength(2)
    for (const page of pages) expect(page).toContain('Démo — données inventées')
  })

  it('prints nothing for a real congregation', async () => {
    const pages = await pagesOf(await renderPdfResponse(twoPages(), 'real.pdf'))

    expect(pages).toEqual(['Programme', 'Suite'])
  })

  it('marks a PDF rendered as bytes too', async () => {
    const bytes = await renderPdfBuffer(twoPages(), { demo: true })
    const pages = await readPdf(new Uint8Array(bytes))

    expect(pages.map(page => page.text).every(text => text.includes('Démo — données inventées'))).toBe(true)
  })
})
