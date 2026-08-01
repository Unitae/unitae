import { SearchX, Users } from 'lucide-react'
import { useSearchParams } from 'react-router'

import type { PioneerActivitySummary } from '~/features/publishers'
import {
  distinctGroups,
  filterAnnual,
  filterAuxiliary,
  readPioneerFilters,
} from '~/features/publishers/model/pioneer-filters'
import * as m from '~/i18n/paraglide/messages'
import { EmptyState } from '~/shared/ui/EmptyState'

import { PioneerAnnualSection } from './PioneerAnnualSection'
import { PioneerAuxiliarySection } from './PioneerAuxiliarySection'
import { PioneerDistributionBar } from './PioneerDistributionBar'
import { PioneerRosterFilters } from './PioneerRosterFilters'

export function PioneerRoster({ summary }: { summary: PioneerActivitySummary }) {
  const [params] = useSearchParams()
  const { annual, auxiliary, totals } = summary

  if (annual.length === 0 && auxiliary.length === 0) {
    return <EmptyState icon={Users} title={m.pioneers_empty_title()} description={m.pioneers_empty_description()} />
  }

  const filters = readPioneerFilters(params)
  const shownAnnual = filterAnnual(annual, filters)
  const shownAuxiliary = filterAuxiliary(auxiliary, filters)
  const noMatch = shownAnnual.length === 0 && shownAuxiliary.length === 0

  return (
    <div className="flex flex-col gap-6">
      <PioneerRosterFilters filters={filters} groups={distinctGroups(summary)} />

      {annual.length > 0 && <PioneerDistributionBar totals={totals} />}

      {noMatch ? (
        <EmptyState
          icon={SearchX}
          title={m.pioneers_no_match_title()}
          description={m.pioneers_no_match_description()}
        />
      ) : (
        <>
          <PioneerAnnualSection rows={shownAnnual} />
          <PioneerAuxiliarySection rows={shownAuxiliary} />
        </>
      )}
    </div>
  )
}
