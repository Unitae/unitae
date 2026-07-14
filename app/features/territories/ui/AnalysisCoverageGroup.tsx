import type { CoverageByType } from '~/features/territories/server/compute-coverage-by-territory-type.server'
import type { MonthlyCoverage } from '~/features/territories/server/compute-monthly-coverage-evolution.server'
import type { NeverWorkedResult } from '~/features/territories/server/territories-never-worked.server'
import MonthlyCoverageChart from '~/features/territories/ui/MonthlyCoverageChart'
import { StatLabel } from '~/features/territories/ui/StatLabel'
import TerritoriesNeverWorkedList from '~/features/territories/ui/TerritoriesNeverWorkedList'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'

interface AnalysisCoverageGroupProps {
  monthlyCoverage: MonthlyCoverage[]
  coverageByType: CoverageByType[]
  neverWorked: NeverWorkedResult
}

export default function AnalysisCoverageGroup({
  monthlyCoverage,
  coverageByType,
  neverWorked,
}: AnalysisCoverageGroupProps) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-display font-semibold text-lg">{m.stats_coverage_over_time_heading()}</h3>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">{m.stats_monthly_coverage_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyCoverageChart data={monthlyCoverage} />
        </CardContent>
      </Card>
      {coverageByType.length > 0 && (
        <div
          className={`grid gap-3 max-sm:grid-cols-1 ${
            coverageByType.length <= 3 ? `grid-cols-${coverageByType.length}` : 'grid-cols-3 max-md:grid-cols-2'
          }`}
        >
          {coverageByType.map(ct => (
            <Card key={ct.kind}>
              <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
                <span className="font-black font-display text-4xl max-sm:text-2xl">
                  {ct.totalCoverage.toFixed(1)} %
                </span>
                <span className="text-muted-foreground text-xs">
                  {m.stats_attributions_percentage({ percentage: ct.coverage.toFixed(1) })}
                </span>
                <StatLabel label={ct.label} help={m.stats_coverage_by_type_help({ label: ct.label })} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">{m.stats_never_worked_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <TerritoriesNeverWorkedList territories={neverWorked.territories} isCapped={neverWorked.isCapped} />
        </CardContent>
      </Card>
    </div>
  )
}
