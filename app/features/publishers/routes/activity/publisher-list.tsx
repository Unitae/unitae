import { ChevronLeft, ChevronRight, Download, Pencil, Plus, Users } from 'lucide-react'
import { Link, redirect, useSearchParams } from 'react-router'
import { sanitizeUser } from '~/features/authentication/server/sanitize-user.server'
import { Role } from '~/features/authorization/model/roles.type'
import { getPublisherStats } from '~/features/publishers/server/get-publisher-stats.server'
import { getPublisherWithActivities } from '~/features/publishers/server/get-publisher-with-activities.server'
import PublisherActivityStats from '~/features/publishers/ui/PublisherActivityStats'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { PublisherType } from '~/shared/types/publisher-type'
import { Button } from '~/shared/ui/button'

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import type { Route } from './+types/publisher-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Activités - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.ActivityViewer,
    Role.ActivityManager,
  ])
  const canViewActivities = can(Role.ActivityViewer)
  const canManageActivities = can(Role.ActivityManager)

  if (!canViewActivities) {
    logger.warn(
      `Try to load publishers' activities. User ID: ${currentUser.id}. Does NOT have rights to access publishers' activity.`,
    )
    throw redirect('/')
  }

  logger.info(`Loading publishers' activities. User ID: ${currentUser.id}.`)

  const timeRange = new Date()
  const searchParams = new URL(request.url).searchParams
  const month = Number(searchParams.get('month') ?? timeRange.getMonth())
  const year = Number(searchParams.get('year') ?? timeRange.getFullYear())

  return withScope(congregationId, async db => {
    const users = await getPublisherWithActivities(db, congregationId, month, year)

    return {
      firstMonth: {
        month: 8,
        year: month < 8 ? year - 1 : year,
      },
      selectedMonth: {
        month,
        year,
      },
      stats: await getPublisherStats(db, congregationId, month, year),
      publishers: users
        .map(sanitizeUser)
        .map(({ activities, ...member }) => ({
          ...member,
          lastActivity: activities.length < 1 ? null : activities[0],
          notRegular:
            activities[0] != null &&
            activities[0].isPublisher === false &&
            (activities[0].hours == null || activities[0].hours === 0),
        }))
        .map(publisher => ({
          ...publisher,
          newActivityUrl: `./new?publisherId=${publisher.id}&month=${month}&year=${year}`,
          editActivityUrl: `./${publisher.lastActivity?.id}/edit`,
        })),
      canManageActivities,
    }
  })
}

type ArrayElement<ArrayType extends readonly unknown[]> = ArrayType extends readonly (infer ElementType)[]
  ? ElementType
  : never

export default function NewActivity({ loaderData }: Route.ComponentProps) {
  const { publishers, selectedMonth, firstMonth, stats, canManageActivities } = loaderData
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedDate = new Date()
  selectedDate.setMonth(selectedMonth.month)
  selectedDate.setFullYear(selectedMonth.year)

  const handleMonthIncrease = () => {
    searchParams.set('month', String(selectedMonth.month === 11 ? 0 : selectedMonth.month + 1))
    searchParams.set('year', String(selectedMonth.month === 11 ? selectedMonth.year + 1 : selectedMonth.year))
    setSearchParams(searchParams)
  }
  const handleMonthDecrease = () => {
    searchParams.set('month', String(selectedMonth.month === 0 ? 11 : selectedMonth.month - 1))
    searchParams.set('year', String(selectedMonth.month === 0 ? selectedMonth.year - 1 : selectedMonth.year))
    setSearchParams(searchParams)
  }

  if (publishers.length < 1) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Activité des proclamateurs"
          subtitle="Visualisation des fiches de proclamateurs et de l'activité associée"
        />

        <EmptyState
          icon={Users}
          title="Il n'y a aucun proclamateur pour le moment !"
          description="Il est donc possible d'afficher l'activité des proclamateurs. Pour ajouter des proclamateurs créez des fiches de proclamateur à partir des utilisateurs."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activité des proclamateurs"
        subtitle="Visualisation des fiches de proclamateurs et de l'activité associée"
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" title="Télécharger les exports" className="max-sm:hidden">
                  <Download className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link
                    to={`./export/${firstMonth.year}/xlsx`}
                    title={`Télécharger le fichier Excel de toutes les activités des proclamateurs durant l'année ${firstMonth.year}`}
                    reloadDocument
                  >
                    Exporter un fichier Excel
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={`./export/${firstMonth.year}/pdfs`} reloadDocument>
                    Exporter l'ensemble des S-21
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={handleMonthDecrease}>
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-[120px] text-center font-medium text-sm sm:min-w-[140px]">
                {selectedDate.toLocaleDateString('fr', {
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
              <Button variant="ghost" size="icon" onClick={handleMonthIncrease}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </>
        }
      />

      <PublisherActivityStats stats={stats} />

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center max-sm:text-left">Prénom</TableHead>
              <TableHead className="text-center">Nom</TableHead>
              <TableHead className="text-center">Groupe</TableHead>
              <TableHead className="text-center max-sm:hidden">Heures</TableHead>
              <TableHead className="text-center max-sm:hidden">Études</TableHead>
              <TableHead className="text-center max-sm:hidden">Pionnier</TableHead>
              <TableHead className="text-center max-sm:hidden">Observations</TableHead>
              {canManageActivities && (
                <TableHead className="w-0">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {publishers.map(publisher => (
              <PublisherRow key={publisher.id} publisher={publisher} canManageActivities={canManageActivities} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function PublisherRow({
  publisher,
  canManageActivities,
}: {
  publisher: ArrayElement<Route.ComponentProps['loaderData']['publishers']>
  canManageActivities: boolean
}) {
  return (
    <TableRow
      key={publisher.email}
      className={publisher.notRegular ? 'bg-destructive/10 text-destructive dark:bg-destructive/5' : ''}
    >
      <TableCell className="text-center max-sm:text-left">
        <Link to={`/congregation/publishers/${publisher.id}/view`} className="hover:text-primary">
          {publisher.firstname}
        </Link>
      </TableCell>
      <TableCell className="text-center">
        <Link to={`/congregation/publishers/${publisher.id}/view`} className="hover:text-primary">
          {publisher.lastname?.toLocaleUpperCase()}
        </Link>
      </TableCell>
      <TableCell className="text-center">
        {publisher.publisherGroup != null && (
          <Link
            to={`/congregation/publisher-groups/${publisher.publisherGroup.id}/edit`}
            className="hover:text-primary"
          >
            {publisher.publisherGroup.name}
          </Link>
        )}
      </TableCell>

      <ActivityColumns publisher={publisher} />

      {canManageActivities && (
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            {publisher.lastActivity != null && (
              <Button asChild variant="ghost" size="icon">
                <Link to={publisher.editActivityUrl}>
                  <Pencil className="size-4" />
                </Link>
              </Button>
            )}
            {publisher.lastActivity == null && (
              <Button asChild variant="ghost" size="icon">
                <Link to={publisher.newActivityUrl}>
                  <Plus className="size-4" />
                </Link>
              </Button>
            )}
          </div>
        </TableCell>
      )}
    </TableRow>
  )
}

function ActivityColumns({ publisher }: { publisher: ArrayElement<Route.ComponentProps['loaderData']['publishers']> }) {
  if (publisher.lastActivity == null) {
    return (
      <TableCell className="text-center text-muted-foreground text-sm italic max-sm:hidden" colSpan={4}>
        Le proclamateur n'a pas rendu son rapport
      </TableCell>
    )
  }

  return (
    <>
      <TableCell className="text-center max-sm:hidden">
        {publisher.lastActivity.type === PublisherType.Normal && publisher.lastActivity.isPublisher && 'a préché'}
        {publisher.lastActivity.type !== PublisherType.Normal && `${publisher.lastActivity?.hours}h`}
      </TableCell>
      <TableCell className="text-center max-sm:hidden">{publisher.lastActivity?.studies}</TableCell>
      <TableCell className="text-center max-sm:hidden">
        {publisher.lastActivity?.type === PublisherType.PionnierAuxiliaires && 'PA'}
        {publisher.lastActivity?.type === PublisherType.PionnierPermanant && 'PP'}
        {publisher.lastActivity?.type === PublisherType.PionnierSpecial && 'PS'}
        {publisher.lastActivity?.type === PublisherType.Missionnaire && 'M'}
        {publisher.lastActivity?.type === PublisherType.Normal && '-'}
      </TableCell>
      <TableCell className="text-center max-sm:hidden">
        {publisher.lastActivity?.notes.length < 1 ? '-' : publisher.lastActivity?.notes}
      </TableCell>
    </>
  )
}
