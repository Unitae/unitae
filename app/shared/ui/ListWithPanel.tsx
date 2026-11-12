import type { SidePanelWalk } from '@unitae/ui'
import type { ReactNode } from 'react'

import * as m from '~/i18n/paraglide/messages'
import type { SideEditorWalk } from '~/shared/ui/hooks/use-side-editor'

interface ListWithPanelProps {
  /** The toolbar and the list. */
  children: ReactNode
  /** The docked `SidePanel`, when one is open and the page is wide enough to dock it. */
  panel?: ReactNode
  /** Keys of the docked panel's walk (`useSideEditor().walk(…)?.onKeyDown`): ↑ and ↓ step through the list. */
  onPanelKeyDown?: SideEditorWalk['onKeyDown']
}

/**
 * A list page's [list | panel] row. The list column is the `list` container, so the list's tables drop to their
 * docked column set with the `docked:` variant (`docked:hidden` on a secondary cell) when the column is too narrow
 * for all of them: beside the docked panel on most screens, and on a tablet.
 */
export function ListWithPanel({ children, panel, onPanelKeyDown }: ListWithPanelProps) {
  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="@container/list flex min-w-0 flex-[3_1_560px] flex-col gap-3">{children}</div>
      {panel != null && (
        // `contents` keeps the panel a flex item of the row while its key presses bubble here.
        // biome-ignore lint/a11y/noStaticElementInteractions: the keys belong to the focusable panel inside
        <div className="contents" onKeyDown={onPanelKeyDown}>
          {panel}
        </div>
      )}
    </div>
  )
}

/** `SidePanel`'s `walk` from the side editor's, with « 3 sur 12 » and the item's own button labels. */
export function sidePanelWalk(
  walk: SideEditorWalk | null,
  labels: { previous: string; next: string },
): SidePanelWalk | undefined {
  if (walk == null) return undefined
  return {
    position: m.common_walk_position({ position: walk.position, total: walk.total }),
    previousLabel: labels.previous,
    nextLabel: labels.next,
    onPrevious: walk.previous,
    onNext: walk.next,
  }
}
