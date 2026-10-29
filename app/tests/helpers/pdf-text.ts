// Reads a rendered PDF back the way a viewer would, for tests that check what a sheet actually
// printed: its pages, and each piece of text with where it sits on the page.
import path from 'node:path'
import '~/features/display-board/ui/pdf-upsert-shim'

// The 14 standard PDF fonts pdfjs reads a sheet's fallback text with.
const STANDARD_FONTS = `${path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts')}/`

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
  /** How many paths the page draws: rules, and the dots of a leader. */
  paths: number
}

/**
 * The items as running text. Pieces that touch on one line are one word split by a change of
 * font (« Nguy » « ễ » « n » when a glyph falls back to another face), so they join as is;
 * everything else is separated by a space. No-break spaces read as plain ones (`\s` covers them).
 */
function joinItems(items: PdfTextItem[]): string {
  let text = ''
  let previous: PdfTextItem | null = null
  for (const item of items) {
    const touching =
      previous != null && Math.abs(item.y - previous.y) < 1 && Math.abs(item.x - (previous.x + previous.width)) < 0.6
    text += (previous == null || touching ? '' : ' ') + item.str
    previous = item
  }
  return text.replace(/\s+/g, ' ').trim()
}

export async function readPdf(data: ArrayBuffer | Uint8Array): Promise<PdfPage[]> {
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({
    data: new Uint8Array(data),
    disableFontFace: true,
    useSystemFonts: false,
    standardFontDataUrl: STANDARD_FONTS,
  })
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
    const operators = await page.getOperatorList()
    const paths = operators.fnArray.filter(operator => operator === OPS.constructPath).length
    pages.push({ width, height, items, text: joinItems(items), paths })
  }
  await task.destroy()
  return pages
}
