// Reads a rendered PDF back the way a viewer would, for tests that check what a sheet actually
// printed: its pages, and each piece of text with where it sits on the page.
import '~/features/display-board/ui/pdf-upsert-shim'

export interface PdfTextItem {
  str: string
  /** Left edge and baseline, in points from the page's bottom-left corner. */
  x: number
  y: number
  width: number
  height: number
}

export interface PdfPage {
  width: number
  height: number
  items: PdfTextItem[]
  /** The page's text, items joined by single spaces. */
  text: string
}

export async function readPdf(data: ArrayBuffer | Uint8Array): Promise<PdfPage[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: new Uint8Array(data), disableFontFace: true, useSystemFonts: false })
  const document = await task.promise
  const pages: PdfPage[] = []
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number)
    const [, , width, height] = page.view
    const content = await page.getTextContent()
    const items = content.items.flatMap(item =>
      'str' in item && item.str.trim() !== ''
        ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height }]
        : [],
    )
    pages.push({
      width,
      height,
      items,
      text: items
        .map(item => item.str)
        .join(' ')
        .replace(/\s+/g, ' '),
    })
  }
  await task.destroy()
  return pages
}
