import { Dialog, DialogContent, DialogTitle } from '~/shared/ui/dialog'

export interface OpenedCapture {
  src: string
  alt: string
  width: number
  height: number
}

/**
 * A capture at its own size, over the page: what a reader opens when the panel or a phone shrinks it. The image is
 * the one the theme shows; past the screen's size, the dialog scrolls.
 */
export function HelpCaptureDialog({ capture, onClose }: { capture: OpenedCapture | null; onClose: () => void }) {
  return (
    <Dialog open={capture != null} onOpenChange={open => !open && onClose()}>
      {capture && (
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-auto p-4 pt-12 sm:max-w-[min(calc(100%-2rem),var(--capture-width))]"
          style={{ '--capture-width': `${capture.width + 34}px` } as React.CSSProperties}
        >
          <DialogTitle className="sr-only">{capture.alt}</DialogTitle>
          <img
            src={capture.src}
            alt={capture.alt}
            width={capture.width}
            height={capture.height}
            className="h-auto max-w-none rounded-lg border border-border"
          />
        </DialogContent>
      )}
    </Dialog>
  )
}

/** The capture a click landed on, as the theme shows it, or `null` when the click was elsewhere in the article. */
export function capturePressed(target: EventTarget | null): OpenedCapture | null {
  if (!(target instanceof Element)) return null
  const button = target.closest('[data-help-capture]')
  if (button == null) return null
  const shown = [...button.querySelectorAll('img')].find(image => getComputedStyle(image).display !== 'none')
  if (shown == null) return null
  // The attributes hold the capture's own size; `width` and `height` as properties are its shrunk one.
  return {
    src: shown.currentSrc || shown.src,
    alt: shown.alt,
    width: Number(shown.getAttribute('width')),
    height: Number(shown.getAttribute('height')),
  }
}
