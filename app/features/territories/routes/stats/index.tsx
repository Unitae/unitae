import { Info } from 'lucide-react'
import { redirect } from 'react-router'
import { Cell, Pie, PieChart } from 'recharts'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { getGroups } from '~/features/publishers/server/groups'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { countActiveWorkingTerritories } from '~/features/territories/server/active-working-territories.server'
import { countAvailableTerritories } from '~/features/territories/server/available-territories.server'
import { computeAttributionsPerMonth } from '~/features/territories/server/compute-attributions-per-month.server'
import { computeAvailabilityGap } from '~/features/territories/server/compute-availability-gap.server'
import { computeCoverageByTerritoryType } from '~/features/territories/server/compute-coverage-by-territory-type.server'
import { computeDurationStats } from '~/features/territories/server/compute-duration-stats.server'
import { computeMonthlyCoverageEvolution } from '~/features/territories/server/compute-monthly-coverage-evolution.server'
import { computeOverdueRate } from '~/features/territories/server/compute-overdue-rate.server'
import { computeRankedTerritories } from '~/features/territories/server/compute-ranked-territories.server'
import { computeRestPeriodUtilization } from '~/features/territories/server/compute-rest-period-utilization.server'
import { countDelayedWorkingTerritories } from '~/features/territories/server/delayed-working-territories.server'
import { fetchActiveAttributionsByGroup } from '~/features/territories/server/fetch-attributions-by-group.server'
import { fetchAttributionsForStats } from '~/features/territories/server/fetch-attributions-for-stats.server'
import { fetchTerritoryCounts, getTotalTerritoryCount } from '~/features/territories/server/fetch-territory-counts.server'
import { parseStatsFilterParams } from '~/features/territories/server/parse-stats-filter-params.server'
import { countRestingTerritories } from '~/features/territories/server/resting-territories.server'
import { computeTerritoryCoverage } from '~/features/territories/server/territory-coverage.server'
import { computeTerritoryCoverageTotal } from '~/features/territories/server/territory-coverage-total.server'
import { getTerritoriesNeverWorked } from '~/features/territories/server/territories-never-worked.server'
import {
  getBeginingDateOfTheocraticYear,
  getCurrentTheocraticYear,
  getEndDateOfTheocraticYear,
  getPreviousTheocraticYear,
} from '~/features/territories/server/theocratic-year.server'
import AttributionsPerMonthChart from '~/features/territories/ui/AttributionsPerMonthChart'
import MonthlyCoverageChart from '~/features/territories/ui/MonthlyCoverageChart'
import TerritoriesNeverWorkedList from '~/features/territories/ui/TerritoriesNeverWorkedList'
import YearOverYearTable from '~/features/territories/ui/YearOverYearTable'
import StatsFilters from '~/features/territories/ui/StatsFilters'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/shared/ui/tooltip'
import { PageHeader } from '~/shared/ui/PageHeader'
import S13ExportButton from '~/shared/ui/S13ExportButton'
import type { Route } from './+types/index'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Statistiques du territoire - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { can } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const url = new URL(request.url)
  const params = url.searchParams

  const theocraticYear = getCurrentTheocraticYear()
  const filterParams = parseStatsFilterParams(params, theocraticYear)

  // Paramètres pour l'année précédente (comparaison annuelle)
  const prevYear = getPreviousTheocraticYear()
  const prevParams = {
    ...filterParams,
    startDate: getBeginingDateOfTheocraticYear(prevYear),
    endDate: getEndDateOfTheocraticYear(prevYear),
  }

  // Requêtes parallèles
  const [
    activeWorkingTerritoriesCount,
    delayedWorkingTerritoriesCount,
    restingTerritoriesCount,
    availableTerritoriesCount,
    percentageCovered,
    percentageTotallyCovered,
    attributions,
    prevAttributions,
    territoryCounts,
    allTerritoryCounts,
    neverWorked,
    attributionsByGroup,
    groups,
  ] = await Promise.all([
    countActiveWorkingTerritories(),
    countDelayedWorkingTerritories(),
    countRestingTerritories(),
    countAvailableTerritories(),
    computeTerritoryCoverage(
      filterParams.territoryKind,
      filterParams.attributionKind,
      filterParams.startDate,
      filterParams.endDate,
    ),
    computeTerritoryCoverageTotal(
      filterParams.territoryKind,
      filterParams.attributionKind.length > 0
        ? filterParams.attributionKind
        : [TerritoryAttributionKind.Default, TerritoryAttributionKind.Campaign],
      filterParams.startDate,
      filterParams.endDate,
    ),
    fetchAttributionsForStats(filterParams),
    fetchAttributionsForStats(prevParams),
    fetchTerritoryCounts(filterParams.territoryKind),
    fetchTerritoryCounts(),
    getTerritoriesNeverWorked(filterParams),
    fetchActiveAttributionsByGroup(),
    getGroups(),
  ])

  const workingTerritoriesCount = activeWorkingTerritoriesCount + delayedWorkingTerritoriesCount
  const unavailableTerritoriesCount = restingTerritoriesCount + workingTerritoriesCount
  const territoriesCount = unavailableTerritoriesCount + availableTerritoriesCount

  // Calculs synchrones à partir des données récupérées
  const ranked = computeRankedTerritories(attributions)
  const durationStats = computeDurationStats(attributions)
  const overdueRate = computeOverdueRate(attributions)
  const availabilityGap = computeAvailabilityGap(attributions)
  const attributionsPerMonth = computeAttributionsPerMonth(attributions, filterParams.startDate, filterParams.endDate)
  const monthlyCoverage = computeMonthlyCoverageEvolution(
    attributions,
    territoryCounts,
    filterParams.startDate,
    filterParams.endDate,
  )
  const coverageByType = computeCoverageByTerritoryType(attributions, allTerritoryCounts)
  const restUtilization = computeRestPeriodUtilization(attributions)

  // Métriques de l'année précédente pour la comparaison
  const prevDuration = computeDurationStats(prevAttributions)
  const prevOverdueRate = computeOverdueRate(prevAttributions)
  const prevTotalCount = getTotalTerritoryCount(territoryCounts)
  const prevTouchedTerritories = new Set(prevAttributions.map(a => a.territoryId))
  const prevCoverage = prevTotalCount > 0 ? (prevAttributions.length / prevTotalCount) * 100 : 0
  const prevTotalCoverage = prevTotalCount > 0 ? (prevTouchedTerritories.size / prevTotalCount) * 100 : 0

  return {
    stats: {
      total: territoriesCount,
      available: availableTerritoriesCount,
      unavailable: unavailableTerritoriesCount,
      resting: restingTerritoriesCount,
      working: workingTerritoriesCount,
      active: activeWorkingTerritoriesCount,
      delayed: delayedWorkingTerritoriesCount,
      coverage: percentageCovered,
      totalCoverage: percentageTotallyCovered,
    },
    progression: {
      ranked,
      durationStats,
      overdueRate,
      availabilityGap,
      attributionsPerMonth,
      restUtilization,
    },
    coverageOverTime: {
      monthlyCoverage,
      coverageByType,
      neverWorked,
    },
    yearOverYear: {
      current: {
        coverage: percentageCovered,
        totalCoverage: percentageTotallyCovered,
        averageDurationDays: durationStats.averageDays,
        overdueRate,
        attributionCount: attributions.length,
      },
      previous: {
        coverage: prevCoverage,
        totalCoverage: prevTotalCoverage,
        averageDurationDays: prevDuration.averageDays,
        overdueRate: prevOverdueRate,
        attributionCount: prevAttributions.length,
      },
    },
    attributionsByGroup,
    theocraticYear,
    groups,
  }
}

const PIE_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-4)',
  'var(--color-chart-3)',
]

const GROUP_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  '#6366f1',
  '#ec4899',
  '#14b8a6',
]

function StatLabel({ label, help }: { label: string; help: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
      {label}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="size-3.5 cursor-help text-muted-foreground/60" />
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-64">
            {help}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  )
}

export default function TerritoryStatsPage({ loaderData }: Route.ComponentProps) {
  const { stats, progression, coverageOverTime, yearOverYear, attributionsByGroup, theocraticYear, groups } = loaderData

  const pieData = [
    { name: 'Disponible', value: stats.available },
    { name: 'Sortis', value: stats.active },
    { name: 'En retard', value: stats.delayed },
    { name: 'En repos', value: stats.resting },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Statistiques du territoire"
        subtitle="Ensemble de donnée analytique sur le territoire de l'assemblée"
        actions={<S13ExportButton theocraticYear={theocraticYear} />}
      />

      {/* ═══ État global ═══ */}
      <h2 className="font-display font-semibold text-xl">État global</h2>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-7xl max-sm:text-5xl">{stats.total}</span>
              <StatLabel
                label="Territoires existants"
                help="Nombre total de territoires enregistrés, qu'ils soient disponibles, sortis ou en repos."
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-7xl max-sm:text-5xl">{stats.available}</span>
              <StatLabel
                label="Territoires disponibles"
                help="Territoires qui ne sont ni sortis, ni en période de repos. Ils peuvent être attribués à un proclamateur."
              />
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.working}</span>
              <StatLabel
                label="Territoires sortis"
                help="Territoires actuellement attribués à un proclamateur (en cours + en retard)."
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.delayed}</span>
              <StatLabel
                label="Territoires en retard"
                help="Territoires sortis dont la date de retour prévue est dépassée."
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.resting}</span>
              <StatLabel
                label="Territoires en repos"
                help="Territoires rendus récemment et en période de repos (90 jours pour le porte-à-porte, 15 jours pour les campagnes et le téléphone)."
              />
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <PieChart width={300} height={300} onMouseEnter={() => {}}>
                <Pie
                  data={pieData}
                  cx={150}
                  cy={150}
                  innerRadius={60}
                  outerRadius={80}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
              <StatLabel
                label="État du territoire"
                help="Répartition visuelle des territoires entre disponibles, sortis, en retard et en repos."
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              {attributionsByGroup.length > 0 ? (
                <PieChart width={300} height={300} onMouseEnter={() => {}}>
                  <Pie
                    data={attributionsByGroup.map(g => ({ name: g.groupName, value: g.count }))}
                    cx={150}
                    cy={150}
                    innerRadius={60}
                    outerRadius={80}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {attributionsByGroup.map((g, index) => (
                      <Cell key={`group-${g.groupName}`} fill={GROUP_COLORS[index % GROUP_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              ) : (
                <span className="py-12 text-muted-foreground text-sm italic">Aucune attribution active</span>
              )}
              <StatLabel
                label="Répartition par groupe"
                help="Répartition des territoires actuellement sortis par groupe de prédication."
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ═══ Progression ═══ */}
      <h2 className="mt-3 font-display font-semibold text-xl">Progression</h2>
      <div className="flex flex-col gap-3">
        <div className="my-2">
          <StatsFilters groups={groups} />
        </div>
        <div className="grid grid-cols-4 gap-3 max-sm:grid-cols-1 max-md:grid-cols-2">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.coverage.toFixed(2)} %</span>
              <StatLabel
                label="Couverture du territoire"
                help="Nombre d'attributions ayant touché la période sélectionnée, rapporté au nombre total de territoires. Peut dépasser 100 % si un territoire a été attribué plusieurs fois."
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">
                {stats.totalCoverage.toFixed(2)} %
              </span>
              <StatLabel
                label="Couverture complète du territoire"
                help="Pourcentage de territoires ayant eu au moins une attribution durant la période sélectionnée. Maximum 100 %."
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">
                {progression.ranked.most != null
                  ? `${progression.ranked.most.number}`
                  : '-'}
              </span>
              {progression.ranked.most != null && (
                <span className="font-display text-lg text-muted-foreground">
                  ({progression.ranked.most.count} fois)
                </span>
              )}
              <StatLabel
                label="Territoire le plus travaillé"
                help="Territoire ayant reçu le plus d'attributions sur la période sélectionnée."
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">
                {progression.ranked.least != null
                  ? `${progression.ranked.least.number}`
                  : '-'}
              </span>
              {progression.ranked.least != null && (
                <span className="font-display text-lg text-muted-foreground">
                  ({progression.ranked.least.count} fois)
                </span>
              )}
              <StatLabel
                label="Territoire le moins travaillé"
                help="Territoire ayant reçu le moins d'attributions sur la période sélectionnée."
              />
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">
                {progression.durationStats.averageDays} j
              </span>
              <StatLabel
                label="Durée moyenne des attributions"
                help="Nombre moyen de jours entre la sortie et le retour d'un territoire (attributions terminées uniquement)."
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <div className="flex items-baseline gap-2">
                <span className="font-black font-display text-5xl max-sm:text-3xl">
                  {progression.durationStats.longestDays}
                </span>
                <span className="text-2xl text-muted-foreground">/</span>
                <span className="font-black font-display text-5xl max-sm:text-3xl">
                  {progression.durationStats.shortestDays}
                </span>
                <span className="font-display text-2xl">j</span>
              </div>
              <StatLabel
                label="Plus longue / Plus courte attribution"
                help="Durée en jours de l'attribution la plus longue et la plus courte sur la période."
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">
                {progression.overdueRate.toFixed(1)} %
              </span>
              <StatLabel
                label="Taux de retard"
                help="Pourcentage d'attributions rendues après la date de retour prévue."
              />
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">
                {progression.availabilityGap} j
              </span>
              <StatLabel
                label="Délai moyen de disponibilité"
                help="Nombre moyen de jours entre le retour d'un territoire et sa prochaine attribution."
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">
                {progression.restUtilization} j
              </span>
              <StatLabel
                label="Inactivité moy. après repos"
                help="Nombre moyen de jours d'attente entre la fin de la période de repos et la prochaine attribution."
              />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Attributions par mois</CardTitle>
          </CardHeader>
          <CardContent>
            <AttributionsPerMonthChart data={progression.attributionsPerMonth} />
          </CardContent>
        </Card>
      </div>

      {/* ═══ Couverture dans le temps ═══ */}
      <h2 className="mt-3 font-display font-semibold text-xl">Couverture dans le temps</h2>
      <div className="flex flex-col gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Évolution mensuelle de la couverture</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyCoverageChart data={coverageOverTime.monthlyCoverage} />
          </CardContent>
        </Card>
        {coverageOverTime.coverageByType.length > 0 && (
          <div
            className={`grid gap-3 max-sm:grid-cols-1 ${
              coverageOverTime.coverageByType.length <= 3 ? `grid-cols-${coverageOverTime.coverageByType.length}` : 'grid-cols-3 max-md:grid-cols-2'
            }`}
          >
            {coverageOverTime.coverageByType.map(ct => (
              <Card key={ct.kind}>
                <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
                  <span className="font-black font-display text-4xl max-sm:text-2xl">
                    {ct.totalCoverage.toFixed(1)} %
                  </span>
                  <span className="text-muted-foreground text-xs">
                    ({ct.coverage.toFixed(1)} % d'attributions)
                  </span>
                  <StatLabel
                    label={ct.label}
                    help={`Couverture complète pour les territoires "${ct.label}" : pourcentage de territoires ayant eu au moins une attribution.`}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Territoires jamais travaillés</CardTitle>
          </CardHeader>
          <CardContent>
            <TerritoriesNeverWorkedList territories={coverageOverTime.neverWorked} />
          </CardContent>
        </Card>
      </div>

      {/* ═══ Comparaison annuelle ═══ */}
      <h2 className="mt-3 font-display font-semibold text-xl">Comparaison annuelle</h2>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">
            Année {theocraticYear}/{theocraticYear + 1} vs {theocraticYear - 1}/{theocraticYear}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <YearOverYearTable
            current={yearOverYear.current}
            previous={yearOverYear.previous}
            currentLabel={`${theocraticYear}/${theocraticYear + 1}`}
            previousLabel={`${theocraticYear - 1}/${theocraticYear}`}
          />
        </CardContent>
      </Card>
    </div>
  )
}
