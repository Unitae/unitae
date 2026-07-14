import type { MonthlyCount } from '~/features/territories/server/compute-attributions-per-month.server'
import type { DurationStats } from '~/features/territories/server/compute-duration-stats.server'
import type { FoyersReached } from '~/features/territories/server/compute-foyers-reached.server'
import type { RankedTerritoriesResult } from '~/features/territories/server/compute-ranked-territories.server'
import AttributionsPerMonthChart from '~/features/territories/ui/AttributionsPerMonthChart'
import { StatLabel } from '~/features/territories/ui/StatLabel'
import { TerritoryLink } from '~/features/territories/ui/TerritoryLink'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'

interface AnalysisProgressionGroupProps {
  coverage: number
  totalCoverage: number
  ranked: RankedTerritoriesResult
  durationStats: DurationStats
  overdueRate: number
  availabilityGap: number
  restUtilization: number
  foyersReached: FoyersReached
  attributionsPerMonth: MonthlyCount[]
}

export default function AnalysisProgressionGroup({
  coverage,
  totalCoverage,
  ranked,
  durationStats,
  overdueRate,
  availabilityGap,
  restUtilization,
  foyersReached,
  attributionsPerMonth,
}: AnalysisProgressionGroupProps) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-display font-semibold text-lg">{m.stats_progression_heading()}</h3>
      <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1 max-md:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
            <span className="font-black font-display text-5xl max-sm:text-3xl">{coverage.toFixed(2)} %</span>
            <StatLabel label={m.stats_coverage()} help={m.stats_coverage_help()} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
            <span className="font-black font-display text-5xl max-sm:text-3xl">{totalCoverage.toFixed(2)} %</span>
            <StatLabel label={m.stats_total_coverage()} help={m.stats_total_coverage_help()} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
            <span className="font-black font-display text-5xl max-sm:text-3xl">{foyersReached.count}</span>
            {foyersReached.percentage != null && (
              <span className="font-display text-lg text-muted-foreground">
                {m.stats_foyers_reached_subtitle({ percentage: foyersReached.percentage })}
              </span>
            )}
            <StatLabel label={m.stats_foyers_reached()} help={m.stats_foyers_reached_help()} />
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
            {ranked.most != null ? (
              <TerritoryLink
                territory={{ id: ranked.most.id, number: ranked.most.number }}
                className="font-black font-display text-5xl max-sm:text-3xl"
              />
            ) : (
              <span className="font-black font-display text-5xl max-sm:text-3xl">-</span>
            )}
            {ranked.most != null && (
              <span className="font-display text-lg text-muted-foreground">
                {m.stats_times_count({ count: ranked.most.count })}
              </span>
            )}
            <StatLabel label={m.stats_most_worked()} help={m.stats_most_worked_help()} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
            {ranked.least != null ? (
              <TerritoryLink
                territory={{ id: ranked.least.id, number: ranked.least.number }}
                className="font-black font-display text-5xl max-sm:text-3xl"
              />
            ) : (
              <span className="font-black font-display text-5xl max-sm:text-3xl">-</span>
            )}
            {ranked.least != null && (
              <span className="font-display text-lg text-muted-foreground">
                {m.stats_times_count({ count: ranked.least.count })}
              </span>
            )}
            <StatLabel label={m.stats_least_worked()} help={m.stats_least_worked_help()} />
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
            <span className="font-black font-display text-5xl max-sm:text-3xl">{durationStats.averageDays} j</span>
            <StatLabel label={m.stats_avg_duration()} help={m.stats_avg_duration_help()} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
            <div className="flex items-baseline gap-2">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{durationStats.longestDays}</span>
              <span className="text-2xl text-muted-foreground">/</span>
              <span className="font-black font-display text-5xl max-sm:text-3xl">{durationStats.shortestDays}</span>
              <span className="font-display text-2xl">j</span>
            </div>
            {(durationStats.longestTerritory != null || durationStats.shortestTerritory != null) && (
              <span className="font-display text-lg text-muted-foreground">
                {durationStats.longestTerritory != null ? (
                  <TerritoryLink territory={durationStats.longestTerritory} />
                ) : (
                  '-'
                )}
                <span className="mx-1">/</span>
                {durationStats.shortestTerritory != null ? (
                  <TerritoryLink territory={durationStats.shortestTerritory} />
                ) : (
                  '-'
                )}
              </span>
            )}
            <StatLabel label={m.stats_longest_shortest()} help={m.stats_longest_shortest_help()} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
            <span className="font-black font-display text-5xl max-sm:text-3xl">{overdueRate.toFixed(1)} %</span>
            <StatLabel label={m.stats_overdue_rate()} help={m.stats_overdue_rate_help()} />
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
            <span className="font-black font-display text-5xl max-sm:text-3xl">{availabilityGap} j</span>
            <StatLabel label={m.stats_availability_gap()} help={m.stats_availability_gap_help()} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
            <span className="font-black font-display text-5xl max-sm:text-3xl">{restUtilization} j</span>
            <StatLabel label={m.stats_rest_utilization()} help={m.stats_rest_utilization_help()} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">{m.stats_attributions_per_month()}</CardTitle>
        </CardHeader>
        <CardContent>
          <AttributionsPerMonthChart data={attributionsPerMonth} />
        </CardContent>
      </Card>
    </div>
  )
}
