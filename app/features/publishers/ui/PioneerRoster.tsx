import { SearchX, Users } from 'lucide-react'
import { useSearchParams } from 'react-router'

import type { PioneerActivitySummary } from '~/features/publishers'
import {
  distinctGroups,
  filterAnnual,
  filterAuxiliary,
  type PioneerFilters,
  readPioneerFilters,
} from '~/features/publishers/model/pioneer-filters'
import * as m from '~/i18n/paraglide/messages'
import { EmptyState } from '~/shared/ui/EmptyState'
import { useSideEditor } from '~/shared/ui/hooks/use-side-editor'

import { PioneerAnnualSection } from './PioneerAnnualSection'
import { PioneerAuxiliarySection } from './PioneerAuxiliarySection'
import { PioneerPacePanel } from './PioneerPacePanel'
import { PioneerRosterFilters } from './PioneerRosterFilters'
import { PioneerSummary } from './PioneerSummary'

/**
 * The service year's pioneers: the summary above, the roster and, docked beside it from 1280 px, the pace of the
 * pioneer chosen. The panel is read only, so switching pioneers never asks anything.
 */
export function PioneerRoster({ summary }: { summary: PioneerActivitySummary }) {
  const [params] = useSearchParams()
  const { annual, auxiliary, serviceYear } = summary
  const panel = useSideEditor<'pace'>(target => annual.some(row => row.memberId === target.id))
  const open = panel.target && annual.find(row => row.memberId === panel.target?.id)

  if (annual.length === 0 && auxiliary.length === 0) {
    return <EmptyState icon={Users} title={m.pioneers_empty_title()} description={m.pioneers_empty_description()} />
  }

  const filters = readPioneerFilters(params)
  const shownAnnual = filterAnnual(annual, filters)
  const shownAuxiliary = filterAuxiliary(auxiliary, filters)
  const active = annual.filter(row => !row.concluded)
  const counts: Record<PioneerFilters['risk'], number> = {
    all: annual.length,
    red: active.filter(row => row.pace.riskBucket === 'red').length,
    amber: active.filter(row => row.pace.riskBucket === 'amber').length,
    green: active.filter(row => row.pace.riskBucket === 'green').length,
  }

  const pacePanel = open && (
    <PioneerPacePanel
      key={open.memberId}
      row={open}
      serviceYear={serviceYear}
      docked={panel.docked}
      onClose={panel.close}
      returnFocus={panel.target?.trigger ?? null}
    />
  )

  return (
    <div className="flex flex-col gap-5">
      <PioneerSummary summary={summary} />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[3_1_560px] flex-col gap-5">
          <PioneerRosterFilters filters={filters} groups={distinctGroups(summary)} counts={counts} />
          {shownAnnual.length === 0 && shownAuxiliary.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={m.pioneers_no_match_title()}
              description={m.pioneers_no_match_description()}
            />
          ) : (
            <>
              <PioneerAnnualSection
                rows={shownAnnual}
                serviceYear={serviceYear}
                selectedId={open?.memberId ?? null}
                onOpen={(row, trigger) => panel.open({ kind: 'pace', id: row.memberId, trigger })}
              />
              <PioneerAuxiliarySection rows={shownAuxiliary} />
            </>
          )}
        </div>
        {panel.docked && pacePanel}
      </div>
      {!panel.docked && pacePanel}
    </div>
  )
}
