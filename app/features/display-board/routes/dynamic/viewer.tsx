import { Callout } from '@unitae/ui'
import { Download } from 'lucide-react'
import { type CSSProperties, useRef, useState } from 'react'
import { redirect } from 'react-router'
import { BOARD_ACCENT_COLOR } from '~/features/display-board/model/board-appearance'
import { type BoardReader, boardSearchQuery, countDocumentMatches } from '~/features/display-board/model/board-reader'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import { isPrintableDynamicDocument } from '~/features/display-board/model/printable-document'
import { sheetDataFor } from '~/features/display-board/model/programme-sheet-window'
import { parseAppearance } from '~/features/display-board/schemas/appearance.schema'
import {
  getDynamicDocumentData,
  markDynamicDocumentViewed,
} from '~/features/display-board/server/dynamic-documents.server'
import { filterDynamicDataToEvent, readEventIdParam } from '~/features/display-board/server/event-filter.server'
import { buildSectionVisibilityFilter } from '~/features/display-board/server/section-visibility.server'
import { BoardViewerHeader, formatViewerDate } from '~/features/display-board/ui/BoardViewerHeader'
import { BoardMasthead } from '~/features/display-board/ui/dynamic/BoardMasthead'
import { BoardReadingProvider } from '~/features/display-board/ui/dynamic/board-reading'
import { BOARD_WEB_FONT_STACK, BOARD_WEB_FONTS_HREF } from '~/features/display-board/ui/dynamic/board-web-fonts'
import { DocumentSearch } from '~/features/display-board/ui/dynamic/DocumentSearch'
import { DynamicDocumentView } from '~/features/display-board/ui/dynamic/DynamicDocumentView'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
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
import { formatEventDate } from '~/shared/utils/event-time'
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
      include: { section: { select: { name: true } } },
    })

    if (!settings) throw redirect('/board')

    await markDynamicDocumentViewed(db, dynamicId, currentUser.id)

    const rawData = await getDynamicDocumentData(db, settings.dynamicType, settings.dynamicRef, congregationId, {
      showServices: settings.showServices,
      dynamicConfig: settings.dynamicConfig,
    })
    const { data, requestedEventMissing } = filterDynamicDataToEvent(rawData, eventIdFilter)

    // The download follows the narrowing, so the file matches what the reader sees.
    const narrowedToEvent = eventIdFilter != null && !requestedEventMissing
    const pdfUrl = narrowedToEvent
      ? `/board/dynamic/${settings.id}/pdf?eventId=${eventIdFilter}`
      : `/board/dynamic/${settings.id}/pdf`
    const now = new Date()
    // The download route's own rule, programme window included: never offer a sheet it would refuse.
    const printable = data != null && isPrintableDynamicDocument(sheetDataFor(data, { now, timezone, narrowedToEvent }))

    const appearance = data ? parseAppearance(data.type, settings.appearance) : null

    // What the reading layer needs: the reader's own member, and the pages their rights open.
    const reader: BoardReader = {
      memberId: currentUser.member?.id ?? null,
      canViewPublishers: permissions.has(Permission.CanViewPublishers),
      canViewRoles: permissions.has(Permission.CanViewRoles) || permissions.has(Permission.CanManageRoles),
      canViewPrograms: permissions.has(Permission.CanViewPrograms),
    }

    return {
      settings,
      data,
      requestedEventMissing,
      pdfUrl,
      printable,
      appearance,
      congregationName,
      timeZone: timezone,
      now,
      // « À jour au … », worded as the sheet words it.
      asOf: formatEventDate(now, timezone, getLocale(), { day: 'numeric', month: 'long', year: 'numeric' }),
      reader,
    }
  })
}

export default function DynamicViewerPage({ loaderData }: Route.ComponentProps) {
  const {
    settings,
    data,
    requestedEventMissing,
    pdfUrl,
    printable,
    appearance,
    congregationName,
    timeZone,
    now,
    asOf,
    reader,
  } = loaderData

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const debouncedSearch = useDebouncedValue(searchValue, 200)
  const query = boardSearchQuery(debouncedSearch)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  return (
    // The sheet prints alone (⌘P): the shell's chrome steps aside for `data-board-print`, and the page
    // grows to its content instead of scrolling inside the screen's height.
    <div
      data-full-bleed=""
      data-board-print=""
      className="-m-4 flex h-[calc(100vh-2rem)] flex-col md:-m-6 md:h-[calc(100vh-3rem)] print:m-0 print:h-auto"
    >
      <div className="print:hidden">
        <BoardViewerHeader
          sectionName={settings.section.name}
          title={settings.title}
          titleInDocument
          actions={
            <>
              {data && (
                <DocumentSearch
                  open={searchOpen}
                  value={searchValue}
                  count={query == null ? null : countDocumentMatches(data, query)}
                  onOpenChange={setSearchOpen}
                  onValueChange={setSearchValue}
                />
              )}
              {printable && (
                // A plain anchor, not a Link: the target is a PDF resource whose Content-Disposition
                // triggers the download without leaving the page. Hidden when the route would refuse
                // it: an empty document prints a blank page. An icon alone on a phone.
                <Button variant="outline" size="sm" asChild className="max-md:size-11 max-md:px-0">
                  <a href={pdfUrl}>
                    <Download className="size-4" aria-hidden="true" />
                    <span className="max-md:sr-only">{m.board_viewer_download_pdf()}</span>
                  </a>
                </Button>
              )}
            </>
          }
        />
      </div>

      <div
        className="flex-1 overflow-auto print:overflow-visible"
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
            'mx-auto flex w-full flex-col gap-3 px-4 pt-6 md:px-6',
            viewWidth(data?.type, appearance?.layout),
          )}
        >
          <BoardMasthead
            level="h1"
            congregationName={congregationName}
            title={settings.title}
            asOf={m.board_pdf_as_of({ date: asOf })}
            until={
              settings.visibleUntil
                ? m.board_viewer_shown_until({ date: formatViewerDate(settings.visibleUntil, timeZone) })
                : undefined
            }
          />
          {/* The deep link named an event this document does not hold. Saying
              so beats rendering the whole programme as though it were the one
              that was asked for. */}
          {requestedEventMissing && (
            <Callout tone="warning" className="print:hidden">
              {m.board_viewer_event_not_here()}
            </Callout>
          )}
        </div>
        {data && (
          <BoardReadingProvider value={{ reader, query }}>
            <DynamicDocumentView
              data={data}
              layout={appearance?.layout}
              highlightQuery={debouncedSearch}
              scrollContainerRef={scrollContainerRef}
              now={now}
              timeZone={timeZone}
            />
          </BoardReadingProvider>
        )}
      </div>
    </div>
  )
}
