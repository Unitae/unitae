import { redirect } from 'react-router'
import { Cell, Pie, PieChart } from 'recharts'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getGroups } from '~/features/publishers/server/groups'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { countActiveWorkingTerritories } from '~/features/territories/server/active-working-territories.server'
import { countAvailableTerritories } from '~/features/territories/server/available-territories.server'
import { countDelayedWorkingTerritories } from '~/features/territories/server/delayed-working-territories.server'
import { countRestingTerritories } from '~/features/territories/server/resting-territories.server'
import { computeTerritoryCoverage } from '~/features/territories/server/territory-coverage.server'
import { computeTerritoryCoverageTotal } from '~/features/territories/server/territory-coverage-total.server'
import { getCurrentTheocraticYear } from '~/features/territories/server/theocratic-year.server'
import StatsFilters from '~/features/territories/ui/StatsFilters'
import { Card, CardContent } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import S13ExportButton from '~/shared/ui/S13ExportButton'
import type { Route } from './+types/index'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Statistiques du territoire - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const url = new URL(request.url)
  const params = url.searchParams

  const kind = params.getAll('kind') as TerritoryKind[]
  const attributionKind = params.getAll('attributionKind') as TerritoryAttributionKind[]

  const theocraticYear = getCurrentTheocraticYear()

  const activeWorkingTerritoriesCount = await countActiveWorkingTerritories()
  const delayedWorkingTerritoriesCount = await countDelayedWorkingTerritories()
  const workingTerritoriesCount = activeWorkingTerritoriesCount + delayedWorkingTerritoriesCount
  const restingTerritoriesCount = await countRestingTerritories()
  const unavailableTerritoriesCount = restingTerritoriesCount + workingTerritoriesCount
  const availableTerritoriesCount = await countAvailableTerritories()
  const territoriesCount = unavailableTerritoriesCount + availableTerritoriesCount
  const percentageCovered = await computeTerritoryCoverage(
    kind.length > 0 ? kind : [TerritoryKind.Classical],
    attributionKind.length > 0 ? attributionKind : [TerritoryAttributionKind.Default],
    params.get('startDate') != null ? new Date(String(params.get('startDate'))) : new Date(theocraticYear, 8, 1),
    params.get('endDate') != null ? new Date(String(params.get('endDate'))) : new Date(theocraticYear + 1, 7, 31),
  )
  const percentageTotallyCovered = await computeTerritoryCoverageTotal(
    kind.length > 0 ? kind : [TerritoryKind.Classical],
    attributionKind.length > 0
      ? attributionKind
      : [TerritoryAttributionKind.Default, TerritoryAttributionKind.Campaign],
    params.get('startDate') != null ? new Date(String(params.get('startDate'))) : new Date(theocraticYear, 8, 1),
    params.get('endDate') != null ? new Date(String(params.get('endDate'))) : new Date(theocraticYear + 1, 7, 31),
  )

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
    theocraticYear,
    groups: await getGroups(),
  }
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042']

export default function TerritoryStatsPage({ loaderData }: Route.ComponentProps) {
  const { stats, theocraticYear, groups } = loaderData

  const data = [
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

      <h2 className="font-display font-semibold text-xl">État global</h2>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-7xl max-sm:text-5xl">{stats.total}</span>
              <span className="text-muted-foreground text-sm">Territoires existants</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-7xl max-sm:text-5xl">{stats.available}</span>
              <span className="text-muted-foreground text-sm">Territoires disponibles</span>
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.working}</span>
              <span className="text-muted-foreground text-sm">Territoires sortis</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.delayed}</span>
              <span className="text-muted-foreground text-sm">Territoires en retard</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.resting}</span>
              <span className="text-muted-foreground text-sm">Territoires en repos</span>
            </CardContent>
          </Card>
        </div>

        <h2 className="mt-3 font-display font-semibold text-xl">Progression</h2>
        <div className="my-2">
          <StatsFilters groups={groups} />
        </div>
        <div className="grid grid-cols-4 gap-3 max-sm:grid-cols-1 max-md:grid-cols-2">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.coverage.toFixed(2)} %</span>
              <span className="text-muted-foreground text-sm">Couverture du territoire</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">
                {stats.totalCoverage.toFixed(2)} %
              </span>
              <span className="text-muted-foreground text-sm">Couverture complète du territoire</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">-</span>
              <span className="text-muted-foreground text-sm">Territoire le plus travaillé</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">-</span>
              <span className="text-muted-foreground text-sm">Territoire le moins travaillé</span>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
            <PieChart width={300} height={300} onMouseEnter={() => {}}>
              <Pie
                data={data}
                cx={150}
                cy={150}
                innerRadius={60}
                outerRadius={80}
                fill="#8884d8"
                paddingAngle={5}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${entry.name}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
            <span className="text-muted-foreground text-sm">État du territoire</span>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
