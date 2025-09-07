import { InboxArrowDownIcon } from '@heroicons/react/24/outline'
import type { Prisma } from '~/database/generated/client'
import { useState } from 'react'
import { Form, redirect } from 'react-router'
import { getPublishers } from '~/features/publishers/server/publishers'
import { getBoolSetting } from '~/features/settings/server/settings'
import { aggregateEntrance } from '~/features/territories/server/buildings'
import { HeroHeader } from '~/shared/ui/HeroHeader'
import { DeleteLink } from '~/shared/ui/DeleteLink'
import { TerritoryCardLink } from '~/features/territories/ui/TerritoryCardLink'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Modification d'une attribution de territoire - Unitae` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const phoneTypeActive = await getBoolSetting(TerritorySettingKey.TerritoryTypePhoneActive)

  const attribution = await db.attribution.findUnique({
    where: { id: requireParamId(params.attributionId, '/territories/attributions') },
    include: { territory: { include: { entrances: { include: { buildings: true } } } }, publisher: true },
  })

  if (attribution == null) {
    throw redirect('/territories/attributions')
  }

  const users = await getPublishers()

  return { users, phoneTypeActive, attribution, entrances: attribution.territory.entrances.map(aggregateEntrance) }
}

export default function EditAttributionPage({ loaderData }: Route.ComponentProps) {
  const { users, attribution, phoneTypeActive, entrances } = loaderData
  const [shouldShowEndDate, showEndDate] = useState(false)

  return (
    <div className="flex flex-col">
      <HeroHeader
        title="Modifier une attribution"
        subtitle="Mettre à jour l'attribution d'un proclamateur"
        actions={
          attribution.endDate === null && (
            <>
              <button
                title="Rentrer le territoire"
                className={`flex items-center rounded-lg p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm ${shouldShowEndDate ? 'bg-teal-900' : 'bg-teal-600'}`}
                type="button"
                onClick={() => showEndDate(state => !state)}
              >
                <InboxArrowDownIcon className="inline size-6 max-sm:size-5" />
              </button>
              <DeleteLink title="Annuler l'attribution" type="cancel" action={`./${attribution.id}/delete`} />
            </>
          )
        }
      />
      <Form method="post" className="my-5 flex flex-col gap-3">
        <label className="flex-1">
          Territoire
          <input type="hidden" name="territory" value={attribution.territory.id} />
          <TerritoryCardLink territory={attribution.territory} entrances={entrances} />
        </label>
        <label className="flex-1">
          Proclamateur
          <select
            className="w-full appearance-none rounded-md border p-1 dark:border-gray-300"
            name="publisher"
            required
            defaultValue={String(attribution.publisherId)}
            disabled={attribution.endDate !== null}
          >
            <option disabled>Selectionnez un proclamateur</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.lastname?.toLocaleUpperCase()} {user.firstname}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          Type d'attribution
          <select
            className="w-full appearance-none rounded-md border p-1 dark:border-gray-300"
            name="type"
            required
            defaultValue={attribution.type}
            disabled={attribution.endDate !== null}
          >
            <option value={TerritoryAttributionKind.Default}>{phoneTypeActive ? 'Classique' : 'Porte à Porte'}</option>
            {!phoneTypeActive && <option value={TerritoryAttributionKind.Phone}>Téléphone</option>}
            <option value={TerritoryAttributionKind.Campaign}>Campagne de distribution</option>
          </select>
        </label>
        <div className="flex gap-3">
          <label className="flex-1">
            Date de sortie
            <input
              className="h-[34px] w-full rounded-md border p-1 dark:border-gray-300"
              name="start-date"
              type="date"
              defaultValue={attribution.startDate.toLocaleDateString('en-CA')}
              readOnly
            />
          </label>
          {attribution.endDate || shouldShowEndDate ? (
            <label className={'flex-1'}>
              <span className={attribution.endDate ? '' : 'text-red-500'}>Date de rentrée</span>
              <input
                className={`h-[34px] w-full rounded-md border p-1 dark:border-gray-300 ${attribution.endDate ?? 'border-red-500 dark:border-red-500'}`}
                name="end-date"
                type="date"
                defaultValue={
                  attribution.endDate?.toLocaleDateString('en-CA') ?? new Date().toLocaleDateString('en-CA')
                }
                max={new Date().toLocaleDateString('en-CA')}
                readOnly={attribution.endDate !== null}
              />
            </label>
          ) : (
            <label className="flex-1">
              À rentrer le :
              <input
                className="h-[34px] w-full rounded-md border p-1 dark:border-gray-300"
                name="late-date"
                type="date"
                defaultValue={attribution.lateDate?.toLocaleDateString('en-CA')}
                disabled={attribution.endDate !== null}
              />
            </label>
          )}
        </div>
        <label className="grow">
          Notes <span className="text-gray-300 text-xs dark:text-gray-700">(Ne sera pas visible du proclamateur)</span>
          <textarea
            className="w-full rounded-md border p-1 dark:border-gray-300"
            rows={4}
            name="notes"
            readOnly={attribution.endDate !== null}
          >
            {attribution.notes}
          </textarea>
        </label>

        {shouldShowEndDate ? (
          <button
            className="my-4 rounded-lg bg-red-600 p-3 font-semibold text-white hover:bg-red-900"
            type="submit"
            disabled={attribution.endDate !== null}
          >
            Rentrer le territoire
          </button>
        ) : (
          <button
            className="my-4 rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900"
            type="submit"
            disabled={attribution.endDate !== null}
          >
            Enregistrer l'attribution
          </button>
        )}
      </Form>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const form = await request.formData()
  const publisherId = Number(form.get('publisher'))
  const startDateText = String(form.get('start-date'))
  const lateDateText = String(form.get('late-date'))
  const endDateText = String(form.get('end-date'))
  const notes = String(form.get('notes'))
  const type = String(form.get('type'))

  const data: Prisma.XOR<Prisma.AttributionUpdateInput, Prisma.AttributionUncheckedUpdateInput> = {
    publisherId: publisherId,
    notes,
    type,
    startDate: new Date(startDateText),
  }

  const hasLateDate = lateDateText.length > 0 && lateDateText !== 'null'
  if (hasLateDate) {
    data.lateDate = new Date(lateDateText)
  }

  const hasEndDate = endDateText.length > 0 && endDateText !== 'null'
  if (hasEndDate) {
    data.endDate = new Date(endDateText)
  }

  const attribution = await db.attribution.update({
    where: { id: requireParamId(params.attributionId, '/territories/attributions') },
    data,
  })

  return redirect(hasEndDate ? '/territories/attributions' : `/territories/attributions/${attribution.id}/edit`)
}
