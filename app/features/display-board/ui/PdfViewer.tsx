import { AlertCircle, Download, Maximize2, Minus, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { useIsMobile } from '~/shared/ui/hooks/use-mobile'
import { Skeleton } from '~/shared/ui/skeleton'
import { computeAutoFitScale, MAX_USER_ZOOM, MIN_USER_ZOOM, type ViewportSize, ZOOM_STEP } from './pdf-viewer-scaling'

interface PdfViewerProps {
  url: string
  downloadUrl?: string
  downloadName?: string
}

const SCROLLBAR_BUDGET_PX = 16

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist')
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
  return pdfjs
}

// biome-ignore lint/suspicious/noExplicitAny: pdfjs page type is complex and not exported cleanly
async function renderPageToCanvas(page: any, scale: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  canvas.className = 'rounded shadow-sm'
  canvas.style.width = `${viewport.width}px`
  canvas.style.height = `${viewport.height}px`

  const context = canvas.getContext('2d')
  if (context) {
    await page.render({ canvasContext: context, canvas, viewport }).promise
  }
  return canvas
}

async function renderAllPages(
  // biome-ignore lint/suspicious/noExplicitAny: pdfjs document type is complex and not exported cleanly
  pdf: any,
  container: HTMLDivElement,
  viewport: ViewportSize,
  isMobile: boolean,
  userZoom: number,
  isCancelled: () => boolean,
) {
  while (container.firstChild) container.removeChild(container.firstChild)
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    if (isCancelled()) return
    const unscaled = page.getViewport({ scale: 1 })
    const autoFit = computeAutoFitScale({ width: unscaled.width, height: unscaled.height }, viewport, isMobile)
    const canvas = await renderPageToCanvas(page, autoFit * userZoom)
    if (isCancelled()) return
    container.appendChild(canvas)
  }
}

async function fetchPdfDocument(url: string) {
  const pdfjs = await loadPdfJs()
  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to fetch PDF')
  const data = await response.arrayBuffer()
  return pdfjs.getDocument({ data }).promise
}

function measureViewport(scrollArea: HTMLDivElement): ViewportSize {
  const styles = window.getComputedStyle(scrollArea)
  const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight)
  const padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom)
  return {
    width: Math.max(scrollArea.clientWidth - padX - SCROLLBAR_BUDGET_PX, 0),
    height: Math.max(scrollArea.clientHeight - padY - SCROLLBAR_BUDGET_PX, 0),
  }
}

export function PdfViewer({ url, downloadUrl, downloadName }: PdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  // biome-ignore lint/suspicious/noExplicitAny: pdfjs document type is complex and not exported cleanly
  const [pdf, setPdf] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [zoom, setZoom] = useState(1)
  const isMobile = useIsMobile()

  const retry = useCallback(() => {
    setError(false)
    setLoading(true)
    setPdf(null)
    setRetryCount(c => c + 1)
  }, [])

  const zoomIn = useCallback(() => {
    setZoom(z => Math.min(z * ZOOM_STEP, MAX_USER_ZOOM))
  }, [])

  const zoomOut = useCallback(() => {
    setZoom(z => Math.max(z / ZOOM_STEP, MIN_USER_ZOOM))
  }, [])

  const resetZoom = useCallback(() => {
    setZoom(1)
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: url is a re-trigger signal, not consumed
  useEffect(() => {
    setZoom(1)
  }, [url])

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryCount is a re-trigger signal, not a consumed value
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    fetchPdfDocument(url)
      .then(doc => {
        if (!cancelled) setPdf(doc)
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

  useEffect(() => {
    const scrollArea = scrollRef.current
    const canvasContainer = canvasContainerRef.current
    if (!pdf || !scrollArea || !canvasContainer) return

    let cancelled = false
    const viewport = measureViewport(scrollArea)

    renderAllPages(pdf, canvasContainer, viewport, isMobile, zoom, () => cancelled)
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
  }, [pdf, zoom, isMobile])

  return (
    <div className="flex flex-1 flex-col bg-muted/30">
      {!error && (
        <div className="sticky top-[60px] z-10 flex items-center justify-end gap-1 border-b bg-background px-4 py-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={zoomOut}
            disabled={loading || zoom <= MIN_USER_ZOOM}
            title={m.board_viewer_zoom_out()}
            aria-label={m.board_viewer_zoom_out()}
          >
            <Minus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={zoomIn}
            disabled={loading || zoom >= MAX_USER_ZOOM}
            title={m.board_viewer_zoom_in()}
            aria-label={m.board_viewer_zoom_in()}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={resetZoom}
            disabled={loading || zoom === 1}
            title={m.board_viewer_zoom_reset()}
            aria-label={m.board_viewer_zoom_reset()}
          >
            <Maximize2 className="size-4" />
          </Button>
        </div>
      )}
      <div ref={scrollRef} className="flex flex-1 flex-col overflow-auto p-4">
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
        <div ref={canvasContainerRef} className="mx-auto flex flex-col items-center gap-4" />
      </div>
    </div>
  )
}
