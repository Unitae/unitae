import { Info, Users } from 'lucide-react'

import type { PioneerActivitySummary } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'
import { EmptyState } from '~/shared/ui/EmptyState'

import { PioneerAnnualSection } from './PioneerAnnualSection'
import { PioneerAuxiliarySection } from './PioneerAuxiliarySection'
import { PioneerDistributionBar } from './PioneerDistributionBar'

export function PioneerRoster({ summary }: { summary: PioneerActivitySummary }) {
  const { annual, auxiliary, totals } = summary

  if (annual.length === 0 && auxiliary.length === 0) {
    return <EmptyState icon={Users} title={m.pioneers_empty_title()} description={m.pioneers_empty_description()} />
  }

  const hasData = annual.some(r => r.pace.elapsedEnrolled > 0) || auxiliary.some(r => r.auxiliary.enrolledMonths > 0)

  return (
    <div className="flex flex-col gap-6">
      {!hasData && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3 text-muted-foreground text-sm">
          <Info className="size-4 shrink-0" aria-hidden />
          {m.pioneers_insufficient_data()}
        </div>
      )}
      {annual.length > 0 && <PioneerDistributionBar totals={totals} />}
      <PioneerAnnualSection rows={annual} />
      <PioneerAuxiliarySection rows={auxiliary} />
    </div>
  )
}
