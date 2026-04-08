import { PencilIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { data, Link, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getGroups } from '~/features/publishers/server/groups'
import { getBoolSetting } from '~/features/settings/server/settings'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { computeFilters } from '~/features/territories/server/attribution-filters'
import { findActiveAttributionsPaginated } from '~/features/territories/server/attributions'
import { getCurrentTheocraticYear } from '~/features/territories/server/theocratic-year.server'
import AttributionFilters from '~/features/territories/ui/AttributionFilters'
import { AttributionStatus } from '~/features/territories/ui/AttributionStatus'
import logger from '~/shared/libs/logger.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { HeroHeader } from '~/shared/ui/HeroHeader'
import Pagination from '~/shared/ui/Pagination'
import S13ExportButton from '~/shared/ui/S13ExportButton'
import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Listes des attributions - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, session } = await verifySession(request)
  const canViewTerritories = await verifyRole(request, Role.TerritoriesViewer)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)
  const canViewPublisher = await verifyRole(request, Role.PublisherViewer)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)
  const canViewProspection = await verifyRole(request, Role.ProspectionViewer)

  if (!canViewTerritories) {
    if (canViewProspection) {
      throw redirect('/territories/buildings')
    }

    logger.warn(
      `Tried to load territory attributions. User ID: ${currentUser.id}. Does NOT have rights to access territories.`,
    )

    throw redirect('/')
  }

  logger.info(
    `Loading territory attributions. User ID: ${currentUser.id}. ${canManageTerritories ? 'Has' : 'Does NOT have'} rights to manage territories.`,
  )

  const phoneTypeActive = await getBoolSetting(TerritorySettingKey.TerritoryTypePhoneActive)

  const url = new URL(request.url)
  const selectors = computeFilters(url.searchParams)
  selectors.endDate = null

  const { attributions, pagination } = await findActiveAttributionsPaginated(selectors, url)

  const messages = { success: session.get('success'), error: session.get('error') }
  const groups = await getGroups()
  const theocraticYear = getCurrentTheocraticYear()

  return data(
    {
      messages,
      stats: {
        total: pagination.total,
      },
      attributions,
      pagination,
      canManageTerritories,
      canManagePublisher,
      canViewPublisher,
      groups,
      phoneTypeActive,
      theocraticYear,
    },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function AttributionListPage({ loaderData }: Route.ComponentProps) {
  const {
    messages,
    pagination,
    attributions,
    canManageTerritories,
    theocraticYear,
    groups,
    phoneTypeActive,
    canViewPublisher,
  } = loaderData

  if (attributions.length < 1) {
    return (
      <div className="flex flex-col gap-5">
        <AlertMessages messages={messages} />
        <HeroHeader
          title="Attributions"
          subtitle="Liste des attributions en cours"
          actions={
            <>
              <S13ExportButton theocraticYear={theocraticYear} />
              {canManageTerritories && (
                <Link
                  to="./new/available-territories"
                  title="Créer manuellement un nouveau batiment"
                  className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
                >
                  Attribuer un territoire
                </Link>
              )}
            </>
          }
        />

        <AttributionFilters groups={groups} phoneTypeActive={phoneTypeActive} />

        <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center">
          <p>Il n'y a aucune attribution pour le moment !</p>
          <p>
            Pour attribuer un territoire à un proclamateur, utilisez le bouton "Attribuer un territoire" en haut à
            droite de l'écran.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <AlertMessages messages={messages} />
      <HeroHeader
        title="Attributions"
        subtitle="Liste des attributions en cours"
        actions={
          <>
            <S13ExportButton theocraticYear={theocraticYear} />
            {canManageTerritories && (
              <Link
                to="./new/available-territories"
                title="Créer manuellement un nouveau batiment"
                className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
              >
                Attribuer un territoire
              </Link>
            )}
          </>
        }
      />

      <AttributionFilters groups={groups} phoneTypeActive={phoneTypeActive} />

      <div className="flex grow flex-col gap-3">
        <table className="table grow border-collapse">
          <thead className="border-b border-b-slate-300 text-left font-bold max-sm:text-md dark:border-b-slate-500">
            <tr>
              <th className="w-[200px] py-4 max-sm:w-14 max-sm:text-center">Sortie le</th>
              <th className="w-[150px] py-4 text-center max-sm:w-14">Nº</th>
              <th className="w-[150px] py-4 text-center max-sm:w-14">Proclamateur</th>
              <th className="w-[250px] py-4 text-center max-sm:hidden">Type</th>
              <th className="w-[150px] py-4 text-center max-sm:w-14">Statut</th>
              <th className="py-4 text-center max-sm:hidden">Notes</th>
              <th className="w-[150px] py-4 text-center max-sm:w-12" />
            </tr>
          </thead>
          <tbody className="text-left max-sm:text-sm">
            {[...attributions]
              .sort((attrA, attrB) => {
                const aIsLate = attrA.lateDate == null || attrA.lateDate < new Date()
                const bIsLate = attrB.lateDate == null || attrB.lateDate < new Date()
                if (aIsLate && !bIsLate) {
                  return -1
                }

                if (!aIsLate && bIsLate) {
                  return 1
                }

                return 0
              })
              .map(attribution => (
                <tr key={attribution.id} className="border-b border-b-slate-200 dark:border-b-slate-800">
                  <td className="py-3 max-sm:text-center">
                    {attribution.startDate.toLocaleDateString('fr-FR')}{' '}
                    <span className="text-gray-300 text-xs dark:text-gray-700">
                      ({((Date.now() - attribution.startDate.getTime()) / 3600 / 24 / 1000).toFixed(2)} jours)
                    </span>
                  </td>
                  <td className="py-3 text-center">
                    <Link to={`/territories/territory/${attribution.territoryId}/edit`} className="hover:text-teal-600">
                      {attribution.territory.number}
                    </Link>
                  </td>
                  <td className="py-3 text-center">
                    {canViewPublisher ? (
                      <Link
                        to={`/congregation/publishers/${attribution.publisherId}/view`}
                        className="hover:text-teal-600"
                      >
                        {attribution.publisher.lastname?.toLocaleUpperCase()} {attribution.publisher.firstname}
                      </Link>
                    ) : (
                      <>
                        {attribution.publisher.lastname?.toLocaleUpperCase()} {attribution.publisher.firstname}
                      </>
                    )}
                  </td>
                  <td className="py-3 text-center max-sm:hidden">
                    {attribution.type === TerritoryAttributionKind.Default && 'Porte à porte'}
                    {attribution.type === TerritoryAttributionKind.Campaign && 'Campagne de distribution'}
                    {attribution.type === TerritoryAttributionKind.Phone && 'Téléphones'}
                  </td>
                  <td className="py-3 text-center">
                    <AttributionStatus attribution={attribution} />
                  </td>
                  <td className="py-3 text-center max-sm:hidden">
                    {attribution.notes.length > 0 ? attribution.notes : '-'}
                  </td>
                  <td>
                    <div className="flex items-stretch justify-end gap-3">
                      {canManageTerritories && (
                        <>
                          <Link to={`./${attribution.id}/edit`} className="text-teal-600">
                            <PencilIcon className="inline size-5" />
                          </Link>
                          {attribution.endDate == null && (
                            <Link
                              to={`/territories/attributions/${attribution.id}/delete`}
                              title="Annuler l'attribution"
                              className={'text-red-600'}
                            >
                              <XMarkIcon className={'inline size-6'} />
                            </Link>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
      </div>
    </div>
  )
}
