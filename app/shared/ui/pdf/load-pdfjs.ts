// Loads pdf.js in the browser with its worker and the polyfills older engines need. Shared by the board's PDF viewer
// and the external-speakers list import, which reads a received PDF's text.

export async function loadPdfJs() {
  await import('./pdf-globals-shim')
  await import('./pdf-upsert-shim')
  await import('es-arraybuffer-base64/auto')
  const pdfjs = await import('pdfjs-dist')
  const workerSrc = (await import('./pdf-worker?worker&url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
  return pdfjs
}

const LINE_TOLERANCE = 3
const CELL_GAP = 12

interface TextItem {
  str: string
  transform: number[]
  width: number
}

/**
 * The text of a PDF as lines, top to bottom, page after page: the items sharing a baseline are joined left to right,
 * with a wide gap between two of them kept as a wider space (a table's columns). A scanned PDF has no text layer and
 * gives no lines.
 */
export async function extractPdfLines(data: ArrayBuffer): Promise<string[]> {
  const pdfjs = await loadPdfJs()
  const document = await pdfjs.getDocument({ data }).promise
  const lines: string[] = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    const items = (content.items as TextItem[]).filter(item => typeof item.str === 'string' && item.str.trim() !== '')
    const rows: { y: number; items: TextItem[] }[] = []
    for (const item of items) {
      const y = item.transform[5] ?? 0
      const row = rows.find(each => Math.abs(each.y - y) <= LINE_TOLERANCE)
      if (row) row.items.push(item)
      else rows.push({ y, items: [item] })
    }
    rows.sort((a, b) => b.y - a.y)
    for (const row of rows) {
      row.items.sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0))
      let text = ''
      let end: number | null = null
      for (const item of row.items) {
        const x = item.transform[4] ?? 0
        if (end != null) text += x - end > CELL_GAP ? '   ' : ' '
        text += item.str
        end = x + item.width
      }
      lines.push(text.trim())
    }
  }
  return lines
}
