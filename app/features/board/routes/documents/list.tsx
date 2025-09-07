import { ChevronDownIcon, ChevronUpIcon, EyeIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { Form, Link, redirect } from 'react-router'
import { DocumentVisibility } from '~/features/board/ui/DocumentVisibility'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Liste des documents du Tableau d'affichage - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canUploadDocument = await verifyRole(request, Role.BoardUploader)

  if (!canUploadDocument) {
    logger.warn(`Tried to load board documents. User ID: ${currentUser.id}. Does NOT have rights to upload document.`)

    throw redirect('/')
  }

  logger.info(
    `Loading board documents. User ID: ${currentUser.id}. ${canUploadDocument ? 'Has' : 'Does NOT have'} rights to upload document.`,
  )

  const documents = await db.boardDocument.findMany({
    include: {
      section: true,
      viewedBy: {
        select: {
          id: true,
        },
      },
    },
    orderBy: [
      {
        section: { order: 'asc' },
      },
      { order: 'asc' },
    ],
  })

  return { documents }
}

export default function DocumentListPage({ loaderData }: Route.ComponentProps) {
  const { documents } = loaderData

  if (documents.length === 0) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
          <div>
            <h1 className="my-3 font-bold text-4xl max-sm:text-2xl">Documents</h1>
            <p className="text-gray-500 max-sm:text-sm">Liste de toutes les documents du tableau d'affichage</p>
          </div>
          <div>
            <Link
              to="./new"
              className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
            >
              Téléverser un document
            </Link>
          </div>
        </div>

        <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center">
          <p>Il n'y a aucun document pour le moment !</p>
          <p>
            Lorsque des documents seront ajoutés, ils apparaîtront ici. Pour en ajouter, cliquez sur le bouton
            ci-dessus.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
        <div>
          <h1 className="my-3 font-bold text-4xl max-sm:text-2xl">Documents</h1>
          <p className="text-gray-500 max-sm:text-sm">Liste de toutes les documents du tableau d'affichage</p>
        </div>
        <div>
          <Link
            to="./new"
            className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
          >
            Téléverser un document
          </Link>
        </div>
      </div>

      <table className="mt-6 table grow border-collapse">
        <thead className="border-b border-b-slate-300 text-left font-bold max-sm:text-md dark:border-b-slate-500">
          <tr>
            <th className="py-4 text-left">Nom</th>
            <th className="py-4 text-left max-sm:w-[110px] max-sm:text-center">
              Sec<span className="hidden max-sm:inline">.</span>
              <span className="max-sm:hidden">tion</span>
            </th>
            <th className="w-[150px] py-4 text-center max-sm:hidden">Vues uniques</th>
            <th className="w-[150px] py-4 text-center max-sm:w-14">
              Vis<span className="hidden max-sm:inline">.</span>
              <span className="max-sm:hidden">ibilité</span>
            </th>
            <th className="w-[150px] py-4 text-center max-sm:w-14">
              Pos<span className="hidden max-sm:inline">.</span>
              <span className="max-sm:hidden">ition</span>
            </th>
            <th className="w-[150px] py-4 text-center max-sm:w-10 max-sm:text-right" />
          </tr>
        </thead>
        <tbody className="text-left max-sm:text-sm">
          {documents.map(document => (
            <tr key={document.id} className="border-b border-b-slate-200 dark:border-b-slate-800">
              <td className="py-3 text-left">{document.title}</td>
              <td className="py-3 text-left max-sm:hidden">{document.section.name}</td>
              <td className="hidden py-3 text-center max-sm:table-cell">{(document.section.order ?? 0) / 5 + 1}</td>
              <td className="py-3 text-center max-sm:hidden">{document.viewedBy.length}</td>
              <td className="py-3 text-center">
                <DocumentVisibility document={document} />
              </td>
              <td>
                <div className="flex items-stretch justify-center gap-3">
                  <Form method="post" action={`./${document.id}/move-up`}>
                    <button type="submit" className="text-teal-600">
                      <ChevronUpIcon className="inline size-5" />
                    </button>
                  </Form>
                  <Form method="post" action={`./${document.id}/move-down`}>
                    <button type="submit" className="text-teal-600">
                      <ChevronDownIcon className="inline size-5" />
                    </button>
                  </Form>
                </div>
              </td>
              <td>
                <div className="flex items-stretch justify-end gap-3">
                  <Link reloadDocument to={`./${document.id}/view`} className="text-teal-600">
                    <EyeIcon className="inline size-5" />
                  </Link>
                  <Link to={`./${document.id}/edit`} className="text-teal-600">
                    <PencilIcon className="inline size-5" />
                  </Link>
                  <Link
                    to={`./${document.id}/delete`}
                    title="Supprimer complètement le document"
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
