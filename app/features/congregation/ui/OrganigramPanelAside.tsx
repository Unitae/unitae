import { X } from 'lucide-react'
import { Link } from 'react-router'
import { OrganigramNodePanel, type PanelNode } from '~/features/congregation/ui/OrganigramNodePanel'
import { Button } from '~/shared/ui/button'
import type { PersonOption } from '~/shared/ui/PersonDropdown'

/*
        One panel, positioned by CSS rather than by two components.

        Below lg it is pinned to the bottom of the viewport like a sheet; at lg and above it
        becomes a sticky column beside the chart. Deliberately not a Radix Sheet: that renders
        an overlay at every width, which covered the desktop layout, and mounting both variants
        duplicated every heading in the DOM. Plain CSS also means no client state to lose across
        a form post, and the chart stays readable behind the panel on a phone.
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
      className={[
        // Docked above the bottom tab bar, not over it: the bar is fixed at z-40 with a
        // 56px body, and `FormActions` already establishes this offset for form pages.
        // 60vh rather than 80 so a few rows of the chart stay visible behind the panel —
        // otherwise you lose sight of the node you just selected.
        'fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20',
        'max-h-[60vh] overflow-y-auto border-t bg-background p-4 shadow-lg',
        // Switches at md, the same breakpoint where the tab bar disappears, so there is no
        // band where the panel is docked but there is nothing to dock above.
        'md:sticky md:inset-x-auto md:top-6 md:bottom-auto md:z-auto md:h-fit md:max-h-none',
        'md:w-[22rem] md:shrink-0 md:rounded-xl md:border md:shadow-none',
      ].join(' ')}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-4 md:max-w-none">
        <div className="flex justify-end md:hidden">
          <Button asChild variant="ghost" size="icon" aria-label="Fermer">
            <Link to={{ search: closeSearch }} preventScrollReset>
              <X className="size-4" />
            </Link>
          </Button>
        </div>
        <OrganigramNodePanel
          node={panel}
          people={people}
          peopleWithoutAccount={peopleWithoutAccount}
          nonElderIds={nonElderIds}
          adoptable={adoptable}
          moveTargets={moveTargets}
        />
      </div>
    </aside>
  )
}
