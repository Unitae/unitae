import { X } from 'lucide-react'
import { Link } from 'react-router'
import { OrganigramNodePanel, type PanelNode } from '~/features/congregation/ui/OrganigramNodePanel'
import { Button } from '~/shared/ui/button'
import type { PersonOption } from '~/shared/ui/PersonDropdown'

/*
        One panel, positioned by CSS rather than by two components.

        Below md it is pinned to the bottom of the viewport like a sheet; at md and above it
        becomes a plain column beside the chart — the chart column, not this one, does the
        scrolling on desktop, because `position: sticky` never engages inside the app shell's
        overflow-x-hidden content wrapper. Deliberately not a Radix Sheet: that renders
        an overlay at every width, which covered the desktop layout, and mounting both variants
        duplicated every heading in the DOM. Plain CSS also means no client state to lose across
        a form post, and the chart stays readable behind the panel on a phone.

        The sheet is a header row above a scroll area, not one scrolling box: the node's name and
        the close button stay put — exactly flush with the sheet's top — and content cannot slide
        behind them, however deep the admin scrolls.
      */
interface Props {
  panel: PanelNode
  people: PersonOption[]
  peopleWithoutAccount: number[]
  nonElderIds: number[]
  adoptable: { id: number; name: string }[]
  moveTargets: { id: number; label: string }[]
  /** The current query string with `node` dropped — where the close button goes. */
  closeSearch: string
}

export function OrganigramPanelAside({
  panel,
  people,
  peopleWithoutAccount,
  nonElderIds,
  adoptable,
  moveTargets,
  closeSearch,
}: Props) {
  return (
    <aside
      aria-label={`Service : ${panel.name}`}
      // `data-bottom-sheet` hides the tab bar while the sheet is open (see BottomTabBar):
      // its action buttons would otherwise sit one thumb-width above five navigation targets.
      data-bottom-sheet=""
      className={[
        // Flush with the viewport bottom — the tab bar is hidden while the sheet is open.
        // 60vh rather than 80 so a few rows of the chart stay visible behind the panel —
        // otherwise you lose sight of the node you just selected.
        'fixed inset-x-0 bottom-0 z-20 max-md:pb-[env(safe-area-inset-bottom)]',
        'flex max-h-[60vh] flex-col border-t bg-background shadow-lg',
        // Switches at md, the same breakpoint where the tab bar disappears, so there is no
        // band where the panel is docked but there is nothing to dock above.
        'md:static md:inset-x-auto md:bottom-auto md:z-auto md:h-fit md:max-h-[calc(100vh-14rem)]',
        'md:w-[22rem] md:shrink-0 md:rounded-xl md:border md:shadow-none',
      ].join(' ')}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-1.5">
        <h2 className="truncate font-semibold text-base">{panel.name}</h2>
        <Button asChild variant="ghost" size="icon" aria-label="Fermer">
          <Link to={{ search: closeSearch }} preventScrollReset>
            <X className="size-4" />
          </Link>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="mx-auto flex max-w-2xl flex-col md:max-w-none">
          <OrganigramNodePanel
            node={panel}
            people={people}
            peopleWithoutAccount={peopleWithoutAccount}
            nonElderIds={nonElderIds}
            adoptable={adoptable}
            moveTargets={moveTargets}
          />
        </div>
      </div>
    </aside>
  )
}
