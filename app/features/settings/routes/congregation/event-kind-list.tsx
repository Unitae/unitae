import { redirect } from 'react-router'
import { HeroHeader } from '~/shared/ui/HeroHeader'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getAllEventType } from '~/features/events/server/event-kind.server'
import type { Route } from './+types/event-kind-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Types d'évènement - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageSettings = await verifyRole(request, Role.Admin)

  if (!canManageSettings) {
    throw redirect('/')
  }

  const kinds = await getAllEventType()

  return {
    kinds,
  }
}

export default function EventKindSettingsPage({ loaderData }: Route.ComponentProps) {
  const { kinds } = loaderData
  return (
    <div className="flex flex-col">
      <HeroHeader
        title="Assemblée / Types d'évènement"
        subtitle="Cette page permet de créer ou de modifier les types d'évènement utilisés dans le module des programmes de l'assemblée"
      />

      <table className="mt-6 table grow border-collapse">
        <thead className="border-b border-b-slate-300 text-left font-bold max-sm:text-md dark:border-b-slate-500">
          <tr>
            <th className="w-[200px] py-4 max-sm:w-14">Nom</th>
            <th className="w-[250px] py-4 text-center max-sm:hidden">Couleur</th>
            <th className="w-[250px] py-4 text-center max-sm:hidden">Jour</th>
            <th className="w-[150px] px-1 py-4 text-center max-sm:w-14" />
          </tr>
        </thead>
        <tbody className="text-left max-sm:text-sm">
          {kinds.map(kind => (
            <tr key={kind.name} className="border-b border-b-slate-200 dark:border-b-slate-800">
              <td className="py-3">{kind.name}</td>
              <td className="py-3 text-center max-sm:hidden">
                {kind.color != null ? (
                  <span className="inline-block h-5 w-5 rounded-full" style={{ backgroundColor: kind.color }} />
                ) : (
                  <span className="inline-block h-5 w-5 rounded-full bg-gray-300 opacity-5" />
                )}
              </td>
              <td className="py-3 text-center max-sm:hidden">
                {kind.weekDay != null ? kind.weekDay : 'Aucune récurrence'}
              </td>
              <td className="flex justify-end gap-3 px-1 py-3">
                {/* <Link to={`./${kind.id}/edit`} className="text-teal-600">
                  <PencilIcon className="inline size-5" />
                </Link> */}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
