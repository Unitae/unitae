import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { DocumentCard } from '~/features/board/ui/DocumentCard'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/index'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Tableau d'affichage - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canUploadDocument = await verifyRole(request, Role.BoardUploader)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  const folders = await db.boardSection.findMany({
    where: {},
    include: {
      documents: {
        orderBy: { order: 'asc' },
        where: {
          // biome-ignore lint/style/useNamingConvention: prisma ORM
          OR: [
            {
              visibleFrom: {
                lte: new Date(),
              },
              visibleUntil: {
                gte: new Date(),
              },
            },
            {
              visibleFrom: {
                lte: new Date(),
              },
              visibleUntil: null,
            },
          ],
        },
        include: {
          viewedBy: {
            where: {
              id: {
                equals: currentUser.id,
              },
            },
          },
        },
      },
    },
    orderBy: {
      order: 'asc',
    },
  })

  const hightlightedDocuments = await db.boardDocument.findMany({
    where: {
      isHighlighted: true,
      // biome-ignore lint/style/useNamingConvention: prisma ORM
      OR: [
        {
          visibleFrom: {
            lte: new Date(),
          },
          visibleUntil: {
            gte: new Date(),
          },
        },
        {
          visibleFrom: {
            lte: new Date(),
          },
          visibleUntil: null,
        },
      ],
    },
    orderBy: { order: 'asc' },
    include: {
      viewedBy: {
        where: {
          id: {
            equals: currentUser.id,
          },
        },
      },
    },
  })

  logger.info(
    `Loading board. User ID: ${currentUser.id}. ${canUploadDocument ? 'Has' : 'Does NOT have'} rights to update the board.`,
  )
  return { folders, canUploadDocument, canManageBoard, hightlightedDocuments }
}

export default function BoardLayout({ loaderData }: Route.ComponentProps) {
  const { folders, hightlightedDocuments } = loaderData
  const nonEmptyFolders = folders.filter(folder => folder.documents.length > 0)

  if (nonEmptyFolders.length < 1) {
    return (
      <div>
        <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center">
          <p>Il n'y a aucun document pour le moment !</p>
          <p>Lorsque des documents seront ajoutés, ils apparaîtront ici.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div>
        <div>
          <div className="mb-5 flex flex-wrap gap-3 max-sm:flex-col">
            {hightlightedDocuments.map(file => (
              <DocumentCard key={file.id} file={file} alreadyViewed={file.viewedBy.length > 0} />
            ))}
          </div>
        </div>
        {nonEmptyFolders.map(folder => (
          <div key={folder.id}>
            <h1 className="mt-7 font-bold text-xl">{folder.name}</h1>
            <div className="my-5 flex flex-wrap gap-3 max-sm:flex-col">
              {folder.documents.map(file => (
                <DocumentCard key={file.id} file={file} alreadyViewed={file.viewedBy.length > 0} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
