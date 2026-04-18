import { useEffect, useRef, useState } from 'react'
import * as m from '~/paraglide/messages'
import { Skeleton } from '~/shared/ui/skeleton'

interface PdfViewerProps {
  url: string
}

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist')
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
  return pdfjs
}

// biome-ignore lint/suspicious/noExplicitAny: pdfjs page type is complex and not exported cleanly
async function renderPageToCanvas(page: any, containerWidth: number): Promise<HTMLCanvasElement> {
  const unscaledViewport = page.getViewport({ scale: 1 })
  const scale = containerWidth / unscaledViewport.width
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  canvas.className = 'mb-4 w-full rounded shadow-sm'

  const context = canvas.getContext('2d')
  if (context) {
    await page.render({ canvasContext: context, canvas, viewport }).promise
  }
  return canvas
}

async function renderPdf(url: string, container: HTMLDivElement, isCancelled: () => boolean) {
  const pdfjs = await loadPdfJs()
  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to fetch PDF')
  const data = await response.arrayBuffer()
  if (isCancelled()) return

  const pdf = await pdfjs.getDocument({ data }).promise
  if (isCancelled()) return

  while (container.firstChild) container.removeChild(container.firstChild)
  const containerWidth = container.clientWidth

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    if (isCancelled()) return
    const canvas = await renderPageToCanvas(page, containerWidth)
    if (isCancelled()) return
    container.appendChild(canvas)
  }
}

export function PdfViewer({ url }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    if (!container) return

    renderPdf(url, container, () => cancelled)
      .then(() => {
        if (!cancelled) setLoading(false)
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-muted/30 p-4">
      {loading && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-96 w-full" />
          <p className="text-center text-muted-foreground text-sm">{m.board_viewer_loading()}</p>
        </div>
      )}
      {error && <p className="text-center text-destructive text-sm">{error}</p>}
      <div ref={containerRef} className="mx-auto w-full max-w-3xl" />
    </div>
  )
}
