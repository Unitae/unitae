import { redirect } from 'react-router'
import { Cell, Pie, PieChart } from 'recharts'
import { getGroups } from '~/features/publishers/server/groups'
import { HeroHeader } from '~/shared/ui/HeroHeader'
import S13ExportButton from '~/shared/ui/S13ExportButton'
import StatsFilters from '~/features/territories/ui/StatsFilters'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { countActiveWorkingTerritories } from '~/features/territories/server/active-working-territories.server'
import { countAvailableTerritories } from '~/features/territories/server/available-territories.server'
import { countDelayedWorkingTerritories } from '~/features/territories/server/delayed-working-territories.server'
import { countRestingTerritories } from '~/features/territories/server/resting-territories.server'
import { computeTerritoryCoverage } from '~/features/territories/server/territory-coverage.server'
import { computeTerritoryCoverageTotal } from '~/features/territories/server/territory-coverage-total.server'
import { getCurrentTheocraticYear } from '~/features/territories/server/theocratic-year.server'
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
    <div className="flex flex-col">
      <HeroHeader
        title="Statistiques du territoire"
        subtitle="Ensemble de donnée analytique sur le territoire de l'assemblée"
        actions={<S13ExportButton theocraticYear={theocraticYear} />}
      />

      <h2 className="mt-3 font-semibold text-xl max-sm:text-lg">État global</h2>

      <div className="flex flex-col gap-3 py-3">
        <div className="flex flex-wrap justify-around gap-5 rounded-md bg-gray-200 p-2 max-sm:gap-3 max-sm:text-sm max-md:justify-between dark:bg-gray-900">
          <div
            className={
              'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-white p-4 text-center text-gray-700 dark:bg-gray-950 dark:text-white'
            }
            title="Nombre de territoires qui ont été créés au total"
          >
            <span className="font-black text-8xl max-sm:font-extrabold max-sm:text-5xl">{stats.total}</span>
            Territoires existants
          </div>
          <div
            className={
              'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-white p-4 text-center text-gray-700 dark:bg-gray-950 dark:text-white'
            }
            title="Nombre de territoires qui sont disponibles pour la prédication"
          >
            <span className="font-black text-8xl max-sm:font-extrabold max-sm:text-5xl">{stats.available}</span>
            Territoires disponibles
          </div>
        </div>
        <div className="flex flex-wrap justify-around gap-5 rounded-md bg-gray-200 p-2 max-sm:gap-3 max-sm:text-sm max-md:justify-between dark:bg-gray-900">
          <div
            className={
              'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-white p-4 text-center text-gray-700 dark:bg-gray-950 dark:text-white'
            }
            title="Nombre de territoires qui sont sortis (inclus les territoires en retard et les territoires travaillés en ce moment)"
          >
            <span className="font-black text-6xl max-sm:font-extrabold max-sm:text-3xl">{stats.working}</span>
            Territoires sortis
          </div>
          <div
            className={
              'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-white p-4 text-center text-gray-700 dark:bg-gray-950 dark:text-white'
            }
            title="Nombre de territoires en retard"
          >
            <span className="font-black text-6xl max-sm:font-extrabold max-sm:text-3xl">{stats.delayed}</span>
            Territoires en retard
          </div>
          <div
            className={
              'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-white p-4 text-center text-gray-700 dark:bg-gray-950 dark:text-white'
            }
            title="Nombre de territoire en repos (indisponible mais ne sont pas travaillés pour le moment)"
          >
            <span className="font-black text-6xl max-sm:font-extrabold max-sm:text-3xl">{stats.resting}</span>
            Territoires en repos
          </div>
        </div>
        <h2 className="mt-3 font-semibold text-xl max-sm:text-lg">Progression</h2>
        <div className="my-4">
          <StatsFilters groups={groups} />
        </div>
        <div className="flex flex-wrap justify-around gap-5 rounded-md bg-gray-200 p-2 max-sm:gap-3 max-sm:text-sm max-md:justify-between dark:bg-gray-900">
          <div
            className={
              'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-white p-4 text-center text-gray-700 dark:bg-gray-950 dark:text-white'
            }
            title="Nombre de territoires qui sont sortis (inclus les territoires en retard et les territoires travaillés en ce moment)"
          >
            <span className="font-black text-6xl max-sm:font-extrabold max-sm:text-3xl">
              {stats.coverage.toFixed(2)} %
            </span>
            Couverture du territoire
          </div>
          <div
            className={
              'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-white p-4 text-center text-gray-700 dark:bg-gray-950 dark:text-white'
            }
            title="Nombre de territoires en retard"
          >
            <span className="font-black text-6xl max-sm:font-extrabold max-sm:text-3xl">
              {stats.totalCoverage.toFixed(2)} %
            </span>
            Couverture complète du territoire
          </div>
          <div
            className={
              'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-white p-4 text-center text-gray-700 dark:bg-gray-950 dark:text-white'
            }
            title="Nombre de territoire en repos (indisponible mais ne sont pas travaillés pour le moment)"
          >
            <span className="font-black text-6xl max-sm:font-extrabold max-sm:text-3xl">-</span>
            Territoire le plus travaillé
          </div>
          <div
            className={
              'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-white p-4 text-center text-gray-700 dark:bg-gray-950 dark:text-white'
            }
            title="Nombre de territoire en repos (indisponible mais ne sont pas travaillés pour le moment)"
          >
            <span className="font-black text-6xl max-sm:font-extrabold max-sm:text-3xl">-</span>
            Territoire le moins travaillé
          </div>
        </div>
        <div className="flex flex-wrap justify-around gap-5 rounded-md bg-gray-200 p-2 max-sm:gap-3 max-sm:text-sm max-md:justify-between dark:bg-gray-900">
          <div
            className={
              'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-white p-4 text-center text-gray-700 dark:bg-gray-950 dark:text-white'
            }
            title="Ce graphique représente l'état du territoire de l'assemblée (répartition des territoires disponibles, ceux qui sont travaillé, ceux qui sont en repos et ceux qui sont en retard)"
          >
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
            État du territoire
          </div>
        </div>
      </div>
    </div>
  )
}
