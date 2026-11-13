import { SegmentedControl } from '@unitae/ui'
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { BOARD_ACCENT_COLOR, type BoardAppearance } from '~/features/display-board/model/board-appearance'
import type { getDynamicDocumentData } from '~/features/display-board/server/dynamic-documents.server'
import { BoardMasthead } from '~/features/display-board/ui/dynamic/BoardMasthead'
import { BOARD_WEB_FONT_STACK } from '~/features/display-board/ui/dynamic/board-web-fonts'
import { DynamicDocumentView } from '~/features/display-board/ui/dynamic/DynamicDocumentView'
import { PdfViewer } from '~/features/display-board/ui/PdfViewer'
import * as m from '~/i18n/paraglide/messages'

type DocumentData = NonNullable<Awaited<ReturnType<typeof getDynamicDocumentData>>>

interface AppearancePreviewProps {
  data: DocumentData | null
  appearance: BoardAppearance
  title: string
  congregationName: string
  now: Date
  timeZone: string
  /** Its printable sheet; null on a document not added yet, which has none to render. */
  pdfUrl: string | null
}

/** The board screen drawn at this scale fits the column beside the form. */
const SCREEN_SCALE = 0.42

/** Waits for the choices to settle before asking for a new sheet: each one is rendered on the server. */
function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}

/**
 * The document with today's data, as the board screen shows it or as its PDF prints, following the
 * appearance chosen in the form before it is saved.
 */
export function AppearancePreview({
  data,
  appearance,
  title,
  congregationName,
  now,
  timeZone,
  pdfUrl,
}: AppearancePreviewProps) {
  const [view, setView] = useState<'screen' | 'pdf'>('screen')
  const scroll = useRef<HTMLDivElement>(null)
  // Only the sheet waits for the choices to settle: switching to it asks at once for what is chosen.
  const settled = useSettled(appearance, view === 'pdf' ? 600 : 0)
  const sheetUrl = pdfUrl && `${pdfUrl}?${new URLSearchParams({ ...settled }).toString()}`

  return (
    <aside aria-label={m.board_preview_title()} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-faint text-xs">{m.board_preview_title()}</span>
        {pdfUrl && (
          <SegmentedControl
            size="sm"
            options={[
              { value: 'screen' as const, label: m.board_preview_screen() },
              { value: 'pdf' as const, label: m.board_preview_pdf() },
            ]}
            value={view}
            onValueChange={setView}
            aria-label={m.board_preview_title()}
          />
        )}
      </div>
      {view === 'screen' || sheetUrl == null ? (
        <div
          ref={scroll}
          inert
          className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-background"
          data-board-sheet=""
          data-layout={appearance.layout}
          style={
            {
              fontFamily: BOARD_WEB_FONT_STACK[appearance.typeface],
              '--board-accent': BOARD_ACCENT_COLOR[appearance.accent],
            } as CSSProperties
          }
        >
          {/* Laid out at the board's own width, then scaled down: the columns wrap as they will there. */}
          <div className="w-[1000px] py-6" style={{ zoom: SCREEN_SCALE }}>
            <div className="mx-auto flex max-w-4xl flex-col gap-2 px-6">
              <BoardMasthead congregationName={congregationName} title={title || m.board_form_untitled()} />
            </div>
            {data ? (
              <DynamicDocumentView
                data={data}
                layout={appearance.layout}
                highlightQuery=""
                scrollContainerRef={scroll}
                now={now}
                timeZone={timeZone}
              />
            ) : (
              <p className="px-6 py-8 text-muted-foreground">{m.board_preview_no_data()}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="h-[70vh] overflow-hidden rounded-lg border border-border">
          <PdfViewer key={sheetUrl} url={sheetUrl} />
        </div>
      )}
      <p className="text-faint text-xs">
        {view === 'pdf' ? m.board_preview_pdf_help() : m.board_preview_screen_help()}
      </p>
    </aside>
  )
}
