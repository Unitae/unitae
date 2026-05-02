import { AlertCircle, Download, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Skeleton } from '~/shared/ui/skeleton'

interface PdfViewerProps {
  url: string
  downloadUrl?: string
  downloadName?: string
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

export function PdfViewer({ url, downloadUrl, downloadName }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  const retry = useCallback(() => {
    setError(false)
    setLoading(true)
    setRetryCount(c => c + 1)
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryCount is a re-trigger signal, not a consumed value
  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    if (!container) return

    renderPdf(url, container, () => cancelled)
      .then(() => {
        if (!cancelled) setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [url, retryCount])

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-muted/30 p-4">
      {loading && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-96 w-full" />
          <p className="text-center text-muted-foreground text-sm">{m.board_viewer_loading()}</p>
        </div>
      )}
      {error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="size-8 text-destructive" />
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-base">{m.board_viewer_error_title()}</p>
            <p className="max-w-sm text-muted-foreground text-sm">{m.board_viewer_error_description()}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={retry}>
              <RefreshCw className="mr-2 size-4" />
              {m.board_viewer_retry()}
            </Button>
            {downloadUrl && (
              <Button asChild>
                <a href={downloadUrl} download={downloadName}>
                  <Download className="mr-2 size-4" />
                  {m.board_viewer_download()}
                </a>
              </Button>
            )}
          </div>
        </div>
      )}
      <div ref={containerRef} className="mx-auto w-full max-w-3xl" />
    </div>
  )
}
