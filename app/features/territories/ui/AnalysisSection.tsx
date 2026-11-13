import type { PublisherGroup } from '~/database/generated/client'
import type { MonthlyCount } from '~/features/territories/server/compute-attributions-per-month.server'
import type { CoverageByType } from '~/features/territories/server/compute-coverage-by-territory-type.server'
import type { DurationStats } from '~/features/territories/server/compute-duration-stats.server'
import type { FoyersReached } from '~/features/territories/server/compute-foyers-reached.server'
import type { MonthlyCoverage } from '~/features/territories/server/compute-monthly-coverage-evolution.server'
import type { RankedTerritoriesResult } from '~/features/territories/server/compute-ranked-territories.server'
import type { NeverWorkedResult } from '~/features/territories/server/territories-never-worked.server'
import {
  CoverageByTypeCard,
  MonthlyCoverageCard,
  NeverWorkedCard,
} from '~/features/territories/ui/AnalysisCoverageGroup'
import { AnalysisTiles, AttributionsPerMonthCard } from '~/features/territories/ui/AnalysisProgressionGroup'
import { StatsFilterRow } from '~/features/territories/ui/StatsFilterRow'
import { ZoneHeading } from '~/features/territories/ui/ZoneHeading'
import * as m from '~/i18n/paraglide/messages'

interface AnalysisSectionProps {
  coverage: number
  totalCoverage: number
  progression: {
    ranked: RankedTerritoriesResult
    durationStats: DurationStats
    overdueRate: number | null
    availabilityGap: number | null
    restUtilization: number | null
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
    <section className="flex flex-col gap-4">
      <ZoneHeading eyebrow={m.stats_scope_filtered()} title={m.stats_analysis_heading()} />
      <StatsFilterRow theocraticYear={theocraticYear} groups={groups} />
      <AnalysisTiles
        coverage={coverage}
        totalCoverage={totalCoverage}
        durationStats={progression.durationStats}
        overdueRate={progression.overdueRate}
        availabilityGap={progression.availabilityGap}
        restUtilization={progression.restUtilization}
        foyersReached={progression.foyersReached}
      />
      <div className="grid items-start gap-4 md:grid-cols-2">
        <MonthlyCoverageCard monthlyCoverage={coverageOverTime.monthlyCoverage} />
        <AttributionsPerMonthCard attributionsPerMonth={progression.attributionsPerMonth} />
      </div>
      <div className="grid items-start gap-4 md:grid-cols-2">
        <CoverageByTypeCard coverageByType={coverageOverTime.coverageByType} />
        <NeverWorkedCard
          neverWorked={coverageOverTime.neverWorked}
          ranked={progression.ranked}
          durationStats={progression.durationStats}
        />
      </div>
    </section>
  )
}
