import { Link } from 'react-router'
import type { NeverWorkedTerritory } from '~/features/territories/server/territories-never-worked.server'
import * as m from '~/i18n/paraglide/messages'

interface TerritoriesNeverWorkedListProps {
  territories: NeverWorkedTerritory[]
  isCapped?: boolean
}

const CHIP =
  'inline-flex h-7 items-center rounded-md border border-border px-2 text-sm tabular-nums outline-none transition-colors duration-(--u-duration-fast) hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-9'

/** The territories nobody worked in the period, each a link to its page; one sentence when there are none. */
export default function TerritoriesNeverWorkedList({ territories, isCapped = false }: TerritoriesNeverWorkedListProps) {
  if (territories.length === 0) {
    return <p className="m-0 text-muted-foreground text-sm">{m.stats_never_worked_all_worked_desc()}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-muted-foreground text-sm">{m.stats_never_worked_count({ count: territories.length })}</p>
      <div className="flex flex-wrap gap-1.5">
        {territories.map(t => (
          <Link key={t.id} to={`/territories/territory/${t.id}/view`} className={CHIP}>
            {t.number}
          </Link>
        ))}
        {isCapped && (
          <span className="inline-flex h-7 items-center text-faint text-sm">{m.stats_never_worked_more_capped()}</span>
        )}
      </div>
    </div>
  )
}
