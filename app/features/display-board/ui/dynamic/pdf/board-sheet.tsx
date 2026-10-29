import type { DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import {
  BOARD_ACCENT_COLOR,
  BOARD_LAYOUTS,
  type BoardAppearance,
  type BoardLayout,
  isBoardLayout,
} from '~/features/display-board/model/board-appearance'
import { DynamicType, type ProgrammeDynamicConfig } from '~/features/display-board/model/dynamic-document.type'
import { organigramSheetSize } from '~/features/display-board/model/organigram-sheet'
import { fitPioneersSheet, type SheetPioneer } from '~/features/display-board/model/pioneers-sheet'
import { programmePdfOptions } from '~/features/display-board/model/programme-pdf-options'
import type { ProgrammeSheetEvent } from '~/features/display-board/model/programme-sheet.type'
import { fitGroupsSheet, type SheetPublisherGroup } from '~/features/display-board/model/publisher-groups-sheet'
import { loadBoardPdfTypeface } from '~/features/display-board/server/board-pdf-fonts.server'
import type { OrganigramNode } from '~/shared/domain/organigram.queries'
import { formatEventDate } from '~/shared/utils/event-time'
import { OrganigramDocument } from './OrganigramDocument'
import { PioneersDocument } from './PioneersDocument'
import { ProgrammeDocument } from './ProgrammeDocument'
import { PublisherGroupsDocument } from './PublisherGroupsDocument'

// The printable sheet of a dynamic document, in the look and layout chosen for it: loads its
// typeface, measures with it where the sheet plans its own pages, and draws it.

/** What each sheet prints: the board's own data for that document, as the viewer reads it. */
export type BoardSheetData =
  | { type: typeof DynamicType.Organigram; tree: OrganigramNode[] }
  | { type: typeof DynamicType.PublisherGroups; groups: SheetPublisherGroup[] }
  | { type: typeof DynamicType.Pioneers; pioneers: SheetPioneer[] }
  | {
      type: typeof DynamicType.Programme
      events: (ProgrammeSheetEvent & { templateId: number | null })[]
      config: ProgrammeDynamicConfig | null
      showServices: boolean
    }

export interface BoardSheetOptions {
  title: string
  congregationName: string
  /** When the sheet is printed: « À jour au … », in the congregation's timezone. */
  asOf: Date
  timezone: string
}

function layoutOf<T extends DynamicType>(type: T, appearance: BoardAppearance): BoardLayout<T> {
  return isBoardLayout(type, appearance.layout) ? appearance.layout : BOARD_LAYOUTS[type][0]
}

export async function buildBoardSheet(
  data: BoardSheetData,
  appearance: BoardAppearance,
  options: BoardSheetOptions,
): Promise<ReactElement<DocumentProps>> {
  const measurer = await loadBoardPdfTypeface(appearance.typeface)
  const asOf = formatEventDate(options.asOf, options.timezone, 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const common = {
    title: options.title,
    congregationName: options.congregationName,
    asOf,
    typeface: appearance.typeface,
    accentColor: BOARD_ACCENT_COLOR[appearance.accent],
  }

  switch (data.type) {
    case DynamicType.Organigram:
      return (
        <OrganigramDocument
          {...common}
          tree={data.tree}
          layout={layoutOf(data.type, appearance)}
          size={organigramSheetSize(data.tree, measurer)}
        />
      )
    case DynamicType.PublisherGroups: {
      const plan = fitGroupsSheet(layoutOf(data.type, appearance), data.groups, measurer)
      return <PublisherGroupsDocument {...common} plan={plan} />
    }
    case DynamicType.Pioneers: {
      const layout = layoutOf(data.type, appearance)
      return <PioneersDocument {...common} plan={fitPioneersSheet(layout, data.pioneers, measurer)} layout={layout} />
    }
    case DynamicType.Programme: {
      // The board document's own template choices: which templates print parts and services.
      const { configMap, groupBy } = programmePdfOptions(data)
      return (
        <ProgrammeDocument
          {...common}
          events={data.events}
          configMap={configMap}
          groupBy={groupBy}
          timezone={options.timezone}
          measurer={measurer}
        />
      )
    }
    default: {
      // Every dynamic type has a sheet: a new type must get one here before it compiles.
      const unhandled: never = data
      return unhandled
    }
  }
}
