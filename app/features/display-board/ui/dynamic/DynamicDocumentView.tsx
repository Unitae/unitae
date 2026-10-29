import type { RefObject } from 'react'
import { BOARD_LAYOUTS, type BoardLayout, isBoardLayout } from '~/features/display-board/model/board-appearance'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import type { getDynamicDocumentData } from '~/features/display-board/server/dynamic-documents.server'
import { OrganigramChartView } from './OrganigramChartView'
import { OrganigramView } from './OrganigramView'
import { PioneersView } from './PioneersView'
import { ProgrammeView } from './ProgrammeView'
import { PublisherGroupsView } from './PublisherGroupsView'

// A dynamic document's content on the board screen, in the layout chosen for it.

type DocumentData = NonNullable<Awaited<ReturnType<typeof getDynamicDocumentData>>>

function layoutOf<T extends DynamicType>(type: T, layout: string | undefined): BoardLayout<T> {
  return isBoardLayout(type, layout) ? layout : BOARD_LAYOUTS[type][0]
}

export function DynamicDocumentView({
  data,
  layout,
  highlightQuery,
  scrollContainerRef,
}: {
  data: DocumentData
  layout: string | undefined
  highlightQuery: string
  scrollContainerRef: RefObject<HTMLDivElement | null>
}) {
  switch (data.type) {
    case DynamicType.Organigram:
      return layoutOf(data.type, layout) === 'chart' ? (
        <OrganigramChartView tree={data.tree} />
      ) : (
        <OrganigramView tree={data.tree} />
      )
    case DynamicType.PublisherGroups:
      return <PublisherGroupsView groups={data.groups} layout={layoutOf(data.type, layout)} />
    case DynamicType.Pioneers:
      return <PioneersView pioneers={data.pioneers} layout={layoutOf(data.type, layout)} />
    case DynamicType.Programme:
      return (
        <ProgrammeView
          events={data.events}
          showServices={data.showServices}
          config={data.config}
          highlightQuery={highlightQuery}
          scrollContainerRef={scrollContainerRef}
        />
      )
    default:
      return null
  }
}
