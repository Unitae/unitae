import { ArrowLeft, Download, Info, Search, X } from 'lucide-react'
import { type CSSProperties, useRef, useState } from 'react'
import { Link, redirect } from 'react-router'
import { BOARD_ACCENT_COLOR } from '~/features/display-board/model/board-appearance'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import { isPrintableDynamicDocument } from '~/features/display-board/model/printable-document'
import { sheetDataFor } from '~/features/display-board/model/programme-sheet-window'
import { parseAppearance } from '~/features/display-board/schemas/appearance.schema'
import {
  getContentVersion,
  getDynamicDocumentData,
  markDynamicDocumentViewed,
} from '~/features/display-board/server/dynamic-documents.server'
import { filterDynamicDataToEvent, readEventIdParam } from '~/features/display-board/server/event-filter.server'
import { buildSectionVisibilityFilter } from '~/features/display-board/server/section-visibility.server'
import { BoardMasthead } from '~/features/display-board/ui/dynamic/BoardMasthead'
import { BOARD_WEB_FONT_STACK, BOARD_WEB_FONTS_HREF } from '~/features/display-board/ui/dynamic/board-web-fonts'
import { DynamicDocumentView } from '~/features/display-board/ui/dynamic/DynamicDocumentView'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { useDebouncedValue } from '~/shared/ui/hooks/use-debounced-value'
import { Input } from '~/shared/ui/input'
import { RelativeTime } from '~/shared/ui/RelativeTime'
import { requireParamId } from '~/shared/utils/params.server'
import { cn } from '~/shared/utils/utils'

import type { Route } from './+types/viewer'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.board_viewer_meta_title() }]
}

/** The width each view reads best at; the masthead takes the same, so it lines up with the page. */
function viewWidth(type: DynamicType | undefined, layout: string | undefined): string {
  if (type === DynamicType.PublisherGroups && layout === 'columns') return 'max-w-7xl'
  if (type === DynamicType.Organigram) return layout === 'chart' ? 'max-w-5xl' : 'max-w-3xl'
  return 'max-w-4xl'
}

// The document is shown in its own typeface; a browser only downloads the face it uses.
export const links: Route.LinksFunction = () => [{ rel: 'stylesheet', href: BOARD_WEB_FONTS_HREF }]

export function loader({ params, request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanViewBoard)

  const currentUser = context.get(currentAccountContext)
  const { timezone, displayName: congregationName } = context.get(congregationContext)

  const dynamicId = requireParamId(params.dynamicId, '/board')

  // Deep-link support: `?eventId=N` narrows a Programme dynamic doc down to
  // that one event. Used by notification emails so an assignee lands directly
  // on their assignment. Non-numeric values are ignored.
  const eventIdFilter = readEventIdParam(request)

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    // Fetched through the visibility filter, not merely by id: a deep link
    // into a section the viewer's roles do not cover must not open it.
    const settings = await db.boardDynamicDocumentSettings.findFirst({
      where: {
        id: dynamicId,
        congregationId,
        section: await buildSectionVisibilityFilter(db, currentUser.id, congregationId),
      },
    })

    if (!settings) throw redirect('/board')

    await markDynamicDocumentViewed(db, dynamicId, currentUser.id)

    const [rawData, contentVersion] = await Promise.all([
      getDynamicDocumentData(db, settings.dynamicType, settings.dynamicRef, congregationId, {
        showServices: settings.showServices,
        dynamicConfig: settings.dynamicConfig,
      }),
      getContentVersion(db, settings.dynamicType, settings.dynamicRef, congregationId, settings.dynamicConfig),
    ])
    const { data, requestedEventMissing } = filterDynamicDataToEvent(rawData, eventIdFilter)

    // The download follows the narrowing, so the file matches what the reader sees.
    const narrowedToEvent = eventIdFilter != null && !requestedEventMissing
    const pdfUrl = narrowedToEvent
      ? `/board/dynamic/${settings.id}/pdf?eventId=${eventIdFilter}`
      : `/board/dynamic/${settings.id}/pdf`
    // The download route's own rule, programme window included: never offer a sheet it would refuse.
    const printable =
      data != null && isPrintableDynamicDocument(sheetDataFor(data, { now: new Date(), timezone, narrowedToEvent }))

    const appearance = data ? parseAppearance(data.type, settings.appearance) : null

    return { settings, data, contentVersion, requestedEventMissing, pdfUrl, printable, appearance, congregationName }
  })
}

export default function DynamicViewerPage({ loaderData }: Route.ComponentProps) {
  const { settings, data, contentVersion, requestedEventMissing, pdfUrl, printable, appearance, congregationName } =
    loaderData
  const isProgramme = data?.type === DynamicType.Programme

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const debouncedSearch = useDebouncedValue(searchValue, 200)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  return (
    <div data-full-bleed="" className="-m-4 flex h-[calc(100vh-2rem)] flex-col md:-m-6 md:h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-between gap-2 border-b bg-background px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/board" title={m.board_viewer_back()}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <h1 className="truncate font-semibold text-sm">{settings.title}</h1>
        </div>

        <div className="flex items-center gap-3">
          {contentVersion != null && (
            <span className="hidden text-muted-foreground text-xs sm:inline">
              {m.board_viewer_updated()} <RelativeTime date={contentVersion} />
            </span>
          )}
          {printable && (
            // Same design as the PDF viewer's download button. A plain anchor, not a Link: the
            // target is a PDF resource whose Content-Disposition triggers the download without
            // leaving the page. Hidden when the route would refuse it: an empty document prints
            // a blank page.
            <Button variant="outline" size="sm" asChild>
              <a href={pdfUrl}>
                <Download className="mr-2 size-4" />
                <span className="max-sm:sr-only">{m.board_viewer_download_pdf()}</span>
              </a>
            </Button>
          )}
          {isProgramme && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => {
                  setSearchOpen(prev => !prev)
                  if (searchOpen) setSearchValue('')
                }}
                aria-label={m.board_viewer_search_toggle()}
              >
                {searchOpen ? <X className="size-4" /> : <Search className="size-4" />}
              </Button>
              <div className={cn('relative hidden md:block', searchOpen && '!block')}>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={searchValue}
                  onChange={e => setSearchValue(e.target.value)}
                  placeholder={m.board_viewer_search_placeholder()}
                  className="w-48 pr-9 pl-9 md:w-56"
                  aria-label={m.board_viewer_search_toggle()}
                />
                {searchValue.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setSearchValue('')}
                  >
                    <X className="size-3.5" />
                    <span className="sr-only">{m.common_clear()}</span>
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className="flex-1 overflow-auto"
        ref={scrollContainerRef}
        data-board-sheet=""
        data-layout={appearance?.layout}
        style={
          appearance
            ? ({
                fontFamily: BOARD_WEB_FONT_STACK[appearance.typeface],
                '--board-accent': BOARD_ACCENT_COLOR[appearance.accent],
              } as CSSProperties)
            : undefined
        }
      >
        <div
          className={cn(
            'mx-auto flex w-full flex-col gap-2 px-4 pt-6 md:px-6',
            viewWidth(data?.type, appearance?.layout),
          )}
        >
          <BoardMasthead congregationName={congregationName} title={settings.title} />
          {/* The deep link named an event this document does not hold. Saying
              so beats rendering the whole programme as though it were the one
              that was asked for. */}
          {requestedEventMissing && (
            <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-900 text-sm dark:text-amber-200">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {m.board_viewer_event_not_here()}
            </p>
          )}
        </div>
        {data && (
          <DynamicDocumentView
            data={data}
            layout={appearance?.layout}
            highlightQuery={debouncedSearch}
            scrollContainerRef={scrollContainerRef}
          />
        )}
      </div>
    </div>
  )
}
