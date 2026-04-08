import { ArrowRightIcon } from '@heroicons/react/24/outline'
import { Form, Link, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getBoolSetting, setSetting } from '~/features/settings/server/settings'
import { db } from '~/shared/libs/db.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { PublisherType } from '~/shared/types/publisher-type'
import type { Route } from './+types/settings'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Paramètres du module Assemblée - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageSettings = await verifyRole(request, Role.Admin)

  if (!canManageSettings) {
    throw redirect('/')
  }

  const auxiliaryPioneerProfileActivated = await getBoolSetting(CongregationSettingKey.AuxiliaryPioneerProfileActivated)

  return {
    auxiliaryPioneerProfileActivated: auxiliaryPioneerProfileActivated ?? false,
  }
}

export default function BuildingSettingsPage({ loaderData }: Route.ComponentProps) {
  const { auxiliaryPioneerProfileActivated } = loaderData

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="my-3 font-bold text-4xl max-sm:text-2xl">Assemblée</h1>
          <p className="text-gray-500 max-sm:text-sm">Paramètres du module "Assemblée"</p>
        </div>
        <div className="flex gap-2" />
      </div>
      <Form method="post" className="my-5 flex flex-col gap-3 max-sm:text-sm">
        <h2 className="font-semibold text-xl max-sm:text-lg">Proclamateurs</h2>
        <label className="flex grow items-center gap-1 max-sm:gap-3">
          <input
            className="rounded-md border dark:border-gray-300"
            name={CongregationSettingKey.AuxiliaryPioneerProfileActivated}
            type="checkbox"
            defaultChecked={auxiliaryPioneerProfileActivated}
          />
          <span>
            Activer le profil <span className="font-bold text-teal-600">Pionnier Auxiliaire</span> sur la fiche du
            proclamateur.
          </span>
        </label>
        <h2 className="font-semibold text-xl max-sm:text-lg">Programmes</h2>
        <span className="flex grow items-center justify-between gap-5 rounded-lg bg-gray-50 p-5 text-slate-950 dark:border-gray-300 dark:bg-white">
          <span>Types d'évènements</span>
          <Link to="./event-kinds" className="flex items-center gap-3 text-sm text-teal-600">
            Voir tout <ArrowRightIcon className="size-5" />
          </Link>
        </span>
        <button
          className="my-4 inline-flex items-center justify-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
          type="submit"
        >
          Enregistrer
        </button>
      </Form>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  await verifySession(request)
  const canManageSettings = await verifyRole(request, Role.Admin)

  if (!canManageSettings) {
    throw redirect('/')
  }

  const form = await request.formData()
  const auxiliaryPioneerProfileActivated = String(
    Boolean(form.get(CongregationSettingKey.AuxiliaryPioneerProfileActivated)),
  )

  await setSetting(CongregationSettingKey.AuxiliaryPioneerProfileActivated, auxiliaryPioneerProfileActivated)
  if (auxiliaryPioneerProfileActivated === 'false') {
    await db.user.updateMany({
      where: {
        type: PublisherType.PionnierAuxiliaires,
      },
      data: {
        type: PublisherType.Normal,
      },
    })
  }

  return redirect('/settings')
}
