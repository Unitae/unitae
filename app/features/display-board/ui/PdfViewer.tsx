import { AlertCircle, ChevronDown, Download, Maximize2, Minus, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/shared/ui/collapsible'
import { useIsMobile } from '~/shared/ui/hooks/use-mobile'
import { Skeleton } from '~/shared/ui/skeleton'
import { computeAutoFitScale, MAX_USER_ZOOM, MIN_USER_ZOOM, type ViewportSize, ZOOM_STEP } from './pdf-viewer-scaling'

interface PdfViewerProps {
  url: string
  downloadUrl?: string
  downloadName?: string
}

type PdfErrorStage = 'load' | 'fetch' | 'render'

interface PdfErrorDetails {
  stage: PdfErrorStage
  name: string
  message: string
  httpStatus?: number
  url: string
  timestamp: string
  userAgent: string
}

class PdfFetchError extends Error {
  httpStatus: number
  constructor(httpStatus: number) {
    super(`HTTP ${httpStatus}`)
    this.name = 'PdfFetchError'
    this.httpStatus = httpStatus
  }
}

class PdfLoadError extends Error {
  override cause: unknown
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'PdfLoadError'
    this.cause = cause
  }
}

function buildErrorDetails(stage: PdfErrorStage, err: unknown, url: string): PdfErrorDetails {
  const original = err instanceof PdfLoadError ? err.cause : err
  const e = original instanceof Error ? original : new Error(String(original))
  return {
    stage,
    name: e.name,
    message: e.message,
    httpStatus: e instanceof PdfFetchError ? e.httpStatus : undefined,
    url,
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
  }
}

const SCROLLBAR_BUDGET_PX = 16

async function loadPdfJs() {
  try {
    await import('./pdf-globals-shim')
    await import('./pdf-upsert-shim')
    await import('es-arraybuffer-base64/auto')
    const pdfjs = await import('pdfjs-dist')
    const workerSrc = (await import('./pdf-worker?worker&url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
    return pdfjs
  } catch (err) {
    throw new PdfLoadError(err)
  }
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
  if (!response.ok) throw new PdfFetchError(response.status)
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
  const [error, setError] = useState<PdfErrorDetails | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [renderTrigger, setRenderTrigger] = useState(0)
  const isMobile = useIsMobile()

  useEffect(() => {
    const scrollArea = scrollRef.current
    if (!scrollArea) return
    let lastWidth = scrollArea.clientWidth
    const observer = new ResizeObserver(() => {
      const nextWidth = scrollArea.clientWidth
      if (nextWidth === lastWidth) return
      lastWidth = nextWidth
      setRenderTrigger(t => t + 1)
    })
    observer.observe(scrollArea)
    return () => observer.disconnect()
  }, [])

  const retry = useCallback(() => {
    setError(null)
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
    setError(null)

    fetchPdfDocument(url)
      .then(doc => {
        if (!cancelled) setPdf(doc)
      })
      .catch(err => {
        if (!cancelled) {
          const stage: PdfErrorStage = err instanceof PdfLoadError ? 'load' : 'fetch'
          setError(buildErrorDetails(stage, err, url))
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [url, retryCount])

  // biome-ignore lint/correctness/useExhaustiveDependencies: renderTrigger is a re-trigger signal driven by ResizeObserver
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
      .catch(err => {
        if (!cancelled) {
          setError(buildErrorDetails('render', err, url))
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [pdf, zoom, isMobile, renderTrigger])

  return (
    <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-muted/30">
      {error == null && (
        <div className="flex items-center justify-end gap-1 border-b bg-background px-4 py-2">
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
      <div ref={scrollRef} className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-auto p-4">
        {loading && (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-96 w-full" />
            <p className="text-center text-muted-foreground text-sm">{m.board_viewer_loading()}</p>
          </div>
        )}
        {error != null && (
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
            <Collapsible className="mt-2 w-full max-w-md text-left">
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-3 text-xs">
                <span className="font-medium text-muted-foreground">{m.error_technical_details()}</span>
                <ChevronDown className="size-3.5 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="space-y-1 break-all rounded bg-muted p-2 font-mono text-muted-foreground text-xs">
                  <div>
                    {m.board_viewer_error_detail_stage()} {error.stage}
                  </div>
                  <div>
                    {m.board_viewer_error_detail_name()} {error.name}
                  </div>
                  <div>
                    {m.board_viewer_error_detail_message()} {error.message}
                  </div>
                  {error.httpStatus != null && (
                    <div>
                      {m.board_viewer_error_detail_status()} {error.httpStatus}
                    </div>
                  )}
                  <div>
                    {m.board_viewer_error_detail_url()} {error.url}
                  </div>
                  <div>
                    {m.error_detail_time()} {error.timestamp}
                  </div>
                  <div>
                    {m.board_viewer_error_detail_browser()} {error.userAgent}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
        <div ref={canvasContainerRef} className="mx-auto flex flex-col items-center gap-4" />
      </div>
    </div>
  )
}
