import type { PublisherGroup } from '~/database/generated/client'
import type { MonthlyCount } from '~/features/territories/server/compute-attributions-per-month.server'
import type { CoverageByType } from '~/features/territories/server/compute-coverage-by-territory-type.server'
import type { DurationStats } from '~/features/territories/server/compute-duration-stats.server'
import type { FoyersReached } from '~/features/territories/server/compute-foyers-reached.server'
import type { MonthlyCoverage } from '~/features/territories/server/compute-monthly-coverage-evolution.server'
import type { RankedTerritoriesResult } from '~/features/territories/server/compute-ranked-territories.server'
import type { NeverWorkedResult } from '~/features/territories/server/territories-never-worked.server'
import AnalysisCoverageGroup from '~/features/territories/ui/AnalysisCoverageGroup'
import AnalysisProgressionGroup from '~/features/territories/ui/AnalysisProgressionGroup'
import StatsFilterChipBar from '~/features/territories/ui/StatsFilterChipBar'
import { ZoneHeading } from '~/features/territories/ui/ZoneHeading'
import * as m from '~/i18n/paraglide/messages'

interface AnalysisSectionProps {
  coverage: number
  totalCoverage: number
  progression: {
    ranked: RankedTerritoriesResult
    durationStats: DurationStats
    overdueRate: number
    availabilityGap: number
    restUtilization: number
    foyersReached: FoyersReached
    attributionsPerMonth: MonthlyCount[]
  }
  coverageOverTime: {
    monthlyCoverage: MonthlyCoverage[]
    coverageByType: CoverageByType[]
    neverWorked: NeverWorkedResult
  }
  groups: PublisherGroup[]
  theocraticYear: number
}

export default function AnalysisSection({
  coverage,
  totalCoverage,
  progression,
  coverageOverTime,
  groups,
  theocraticYear,
}: AnalysisSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <ZoneHeading eyebrow={m.stats_scope_filtered()} title={m.stats_analysis_heading()} />
      <StatsFilterChipBar theocraticYear={theocraticYear} groups={groups} />
      <AnalysisProgressionGroup
        coverage={coverage}
        totalCoverage={totalCoverage}
        ranked={progression.ranked}
        durationStats={progression.durationStats}
        overdueRate={progression.overdueRate}
        availabilityGap={progression.availabilityGap}
        restUtilization={progression.restUtilization}
        foyersReached={progression.foyersReached}
        attributionsPerMonth={progression.attributionsPerMonth}
      />
      <AnalysisCoverageGroup
        monthlyCoverage={coverageOverTime.monthlyCoverage}
        coverageByType={coverageOverTime.coverageByType}
        neverWorked={coverageOverTime.neverWorked}
      />
    </section>
  )
}
