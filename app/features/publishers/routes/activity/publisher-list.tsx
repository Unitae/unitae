import {
  ArrowLeftCircleIcon,
  ArrowRightCircleIcon,
  DocumentArrowDownIcon,
  PencilIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { useState } from 'react'
import { Link, redirect, useSearchParams } from 'react-router'
import { sanitizeUser } from '~/features/authentication/server/sanitize-user.server'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getPublisherStats } from '~/features/publishers/server/get-publisher-stats.server'
import { getPublisherWithActivities } from '~/features/publishers/server/get-publisher-with-activities.server'
import PublisherActivityStats from '~/features/publishers/ui/PublisherActivityStats'
import logger from '~/shared/libs/logger.server'
import { PublisherType } from '~/shared/types/publisher-type'
import { HeroHeader } from '~/shared/ui/HeroHeader'
import type { Route } from './+types/publisher-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Activités - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canViewActivities = await verifyRole(request, Role.ActivityViewer)
  const canManageActivities = await verifyRole(request, Role.ActivityManager)

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

  const users = await getPublisherWithActivities(month, year)

  return {
    firstMonth: {
      month: 8,
      year: month < 8 ? year - 1 : year,
    },
    selectedMonth: {
      month,
      year,
    },
    stats: await getPublisherStats(month, year),
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
}

type ArrayElement<ArrayType extends readonly unknown[]> = ArrayType extends readonly (infer ElementType)[]
  ? ElementType
  : never

export default function NewActivity({ loaderData }: Route.ComponentProps) {
  const { publishers, selectedMonth, firstMonth, stats, canManageActivities } = loaderData
  const [searchParams, setSearchParams] = useSearchParams()
  const [shouldShowExport, setShouldShowExport] = useState(false)
  const selectedDate = new Date()
  selectedDate.setMonth(selectedMonth.month)
  selectedDate.setFullYear(selectedMonth.year)

  const handleMonthIncrease = (_month: number) => {
    searchParams.set('month', String(selectedMonth.month === 11 ? 0 : selectedMonth.month + 1))
    searchParams.set('year', String(selectedMonth.month === 11 ? selectedMonth.year + 1 : selectedMonth.year))
    setSearchParams(searchParams)
  }
  const handleMonthDecrease = (_month: number) => {
    searchParams.set('month', String(selectedMonth.month === 0 ? 11 : selectedMonth.month - 1))
    searchParams.set('year', String(selectedMonth.month === 0 ? selectedMonth.year - 1 : selectedMonth.year))
    setSearchParams(searchParams)
  }

  if (publishers.length < 1) {
    return (
      <div className="flex flex-col">
        <HeroHeader
          title="Activité des proclamateurs"
          subtitle="Visualisation des fiches de proclamateurs et de l'activité associée"
        />

        <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center">
          <p>Il n'y a aucun proclamateur pour le moment !</p>
          <p>
            Il est donc possible d'afficher l'activité des proclamateurs. Pour ajouter des proclamateurs créez des
            fiches de proclamateur à partir des utilisateurs.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-7">
      <HeroHeader
        title="Activité des proclamateurs"
        subtitle="Visualisation des fiches de proclamateurs et de l'activité associée"
        actions={
          <>
            <div className="relative max-sm:hidden">
              <button
                type="button"
                className="flex cursor-pointer items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
                title="Télécharger les exports"
                onClick={() => setShouldShowExport(!shouldShowExport)}
              >
                <DocumentArrowDownIcon className="inline size-6 max-sm:size-5" />
              </button>
              <div
                className={`${shouldShowExport ? 'flex' : 'hidden'} absolute top-13 right-0 w-64 flex-col items-stretch gap-1 max-sm:top-10 max-sm:right-auto max-sm:left-0`}
              >
                <Link
                  to={`./export/${firstMonth.year}/xlsx`}
                  className="rounded-lg bg-white p-3 text-gray-700 hover:text-teal-600 max-sm:p-2 max-sm:text-sm"
                  title={`Télécharger le fichier Excel de toutes les activités des proclamateurs durant l'année ${firstMonth.year}`}
                  reloadDocument
                >
                  Exporter un fichier Excel
                </Link>
                <Link
                  to={`./export/${firstMonth.year}/pdfs`}
                  className="rounded-lg bg-white p-3 text-gray-700 hover:text-teal-600 max-sm:p-2 max-sm:text-sm"
                  reloadDocument
                >
                  Exporter l'ensemble des S-21
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" className="m-2 hover:text-teal-600" onClick={() => handleMonthDecrease(1)}>
                <ArrowLeftCircleIcon className="inline size-7" />
              </button>
              {selectedDate.toLocaleDateString('fr', {
                month: 'long',
                year: 'numeric',
              })}
              <button type="button" className="m-2 hover:text-teal-600" onClick={() => handleMonthIncrease(1)}>
                <ArrowRightCircleIcon className="inline size-7" />
              </button>
            </div>
          </>
        }
      />

      <PublisherActivityStats stats={stats} />

      <table className="mt-6 table grow border-collapse">
        <thead className="border-b border-b-slate-300 text-left font-bold max-sm:text-md dark:border-b-slate-500">
          <tr>
            <th className="w-[150px] py-4 text-center max-sm:w-14 max-sm:text-left">Prénom</th>
            <th className="w-[150px] py-4 text-center max-sm:w-14">Nom</th>
            <th className="w-[150px] py-4 text-center max-sm:w-14">Groupe</th>
            <th className="w-[150px] py-4 text-center max-sm:hidden">Heures</th>
            <th className="w-[150px] py-4 text-center max-sm:hidden">Études</th>
            <th className="w-[150px] py-4 text-center max-sm:hidden">Pionnier</th>
            <th className="w-[150px] py-4 text-center max-sm:hidden">Observations</th>
            {canManageActivities && <th className="w-[150px] py-4 text-center max-sm:w-14" />}
          </tr>
        </thead>
        <tbody className="text-left max-sm:text-sm">
          {publishers.map(publisher => (
            <PublisherRow key={publisher.id} publisher={publisher} canManageActivities={canManageActivities} />
          ))}
        </tbody>
      </table>
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
    <tr
      key={publisher.email}
      className={`border-b border-b-slate-200 dark:border-b-slate-800 ${publisher.notRegular && 'bg-red-100 text-red-600 dark:bg-gray-950'}`}
    >
      <td className="py-3 text-center max-sm:text-left">
        <Link to={`/congregation/publishers/${publisher.id}/view`} className="hover:text-teal-600">
          {publisher.firstname}
        </Link>
      </td>
      <td className="py-3 text-center">
        <Link to={`/congregation/publishers/${publisher.id}/view`} className="hover:text-teal-600">
          {publisher.lastname?.toLocaleUpperCase()}
        </Link>
      </td>
      <td className="py-3 text-center">
        {publisher.publisherGroup != null && (
          <Link
            to={`/congregation/publisher-groups/${publisher.publisherGroup.id}/edit`}
            className="hover:text-teal-600"
          >
            {publisher.publisherGroup.name}
          </Link>
        )}
      </td>

      <ActivityColumns publisher={publisher} />

      {canManageActivities && (
        <td className="py-3 text-center max-sm:text-right">
          {publisher.lastActivity != null && (
            <Link to={publisher.editActivityUrl} className="text-teal-600">
              <PencilIcon className="inline size-5" />
            </Link>
          )}
          {publisher.lastActivity == null && (
            <Link to={publisher.newActivityUrl} className="text-teal-600">
              <PlusIcon className="inline size-5" />
            </Link>
          )}
        </td>
      )}
    </tr>
  )
}

function ActivityColumns({ publisher }: { publisher: ArrayElement<Route.ComponentProps['loaderData']['publishers']> }) {
  if (publisher.lastActivity == null) {
    return (
      <td className="py-3 text-center text-sm italic max-sm:hidden" colSpan={4}>
        Le proclamateur n'a pas rendu son rapport
      </td>
    )
  }

  return (
    <>
      <td className="py-3 text-center max-sm:hidden">
        {publisher.lastActivity.type === PublisherType.Normal && publisher.lastActivity.isPublisher && 'a préché'}
        {publisher.lastActivity.type !== PublisherType.Normal && `${publisher.lastActivity?.hours}h`}
      </td>
      <td className="py-3 text-center max-sm:hidden">{publisher.lastActivity?.studies}</td>
      <td className="py-3 text-center max-sm:hidden">
        {publisher.lastActivity?.type === PublisherType.PionnierAuxiliaires && 'PA'}
        {publisher.lastActivity?.type === PublisherType.PionnierPermanant && 'PP'}
        {publisher.lastActivity?.type === PublisherType.PionnierSpecial && 'PS'}
        {publisher.lastActivity?.type === PublisherType.Missionnaire && 'M'}
        {publisher.lastActivity?.type === PublisherType.Normal && '-'}
      </td>
      <td className="py-3 text-center max-sm:hidden">
        {publisher.lastActivity?.notes.length < 1 ? '-' : publisher.lastActivity?.notes}
      </td>
    </>
  )
}
