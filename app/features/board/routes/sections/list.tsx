import { ChevronDownIcon, ChevronUpIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { Form, Link, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Liste des sections du Tableau d'affichage - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  if (!canManageBoard) {
    logger.warn(`Tried to load board sections. User ID: ${currentUser.id}. Does NOT have rights to manage board.`)

    throw redirect('/')
  }

  logger.info(
    `Loading board sections. User ID: ${currentUser.id}. ${canManageBoard ? 'Has' : 'Does NOT have'} rights to manage board sections.`,
  )

  const sections = await db.boardSection.findMany({
    include: {
      documents: true,
    },
    orderBy: {
      order: 'asc',
    },
  })

  return { sections }
}

export default function SectionListPage({ loaderData }: Route.ComponentProps) {
  const { sections } = loaderData

  if (sections.length === 0) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
          <div>
            <h1 className="my-3 font-bold text-4xl max-sm:text-2xl">Sections</h1>
            <p className="text-gray-500 max-sm:text-sm">Liste de toutes les sections du tableau d'affichage</p>
          </div>
          <div>
            <Link
              to="./new"
              className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
            >
              Créer une section
            </Link>
          </div>
        </div>

        <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center">
          <p>Il n'y a aucune section pour le moment !</p>
          <p>
            Lorsque des sections seront crées, elles apparaîtront ici. Pour en ajouter, cliquez sur le bouton ci-dessus.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
        <div>
          <h1 className="my-3 font-bold text-4xl max-sm:text-2xl">Sections</h1>
          <p className="text-gray-500 max-sm:text-sm">Liste de toutes les sections du tableau d'affichage</p>
        </div>
        <div>
          <Link
            to="./new"
            className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
          >
            Créer une section
          </Link>
        </div>
      </div>

      <table className="mt-6 table grow border-collapse">
        <thead className="border-b border-b-slate-300 text-left font-bold max-sm:text-md dark:border-b-slate-500">
          <tr>
            <th className="py-4 text-left">Nom</th>
            <th className="w-[150px] py-4 text-center max-sm:hidden">Documents</th>
            <th className="w-[150px] py-4 text-center max-sm:w-14">Position</th>
            <th className="w-[150px] py-4 text-center max-sm:w-14 max-sm:text-right" />
          </tr>
        </thead>
        <tbody className="text-left max-sm:text-sm">
          {sections.map(section => (
            <tr key={section.id} className="border-b border-b-slate-200 dark:border-b-slate-800">
              <td className="py-3 text-left">{section.name}</td>
              <td className="py-3 text-center max-sm:hidden">{section.documents.length}</td>
              <td>
                <div className="flex items-stretch justify-center gap-3">
                  <Form method="post" action={`/board/sections/${section.id}/move-up`}>
                    <button type="submit" className="text-teal-600">
                      <ChevronUpIcon className="inline size-5" />
                    </button>
                  </Form>
                  <Form method="post" action={`/board/sections/${section.id}/move-down`}>
                    <button type="submit" className="text-teal-600">
                      <ChevronDownIcon className="inline size-5" />
                    </button>
                  </Form>
                </div>
              </td>
              <td>
                <div className="flex items-stretch justify-end gap-3">
                  <Link to={`./${section.id}/edit`} className="text-teal-600">
                    <PencilIcon className="inline size-5" />
                  </Link>
                  <Link
                    to={`./${section.id}/delete`}
                    title="Supprimer complètement la section"
                    className={'text-red-600 max-sm:hidden'}
                  >
                    <TrashIcon className={'inline size-6'} />
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
