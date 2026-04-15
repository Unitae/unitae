import { FileText } from 'lucide-react'
import { Role } from '~/features/authorization/model/roles.type'
import { DocumentCard } from '~/features/board/ui/DocumentCard'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { EmptyState } from '~/shared/ui/EmptyState'

import type { Route } from './+types/index'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Tableau d'affichage - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.BoardUploader,
    Role.BoardValidator,
  ])
  const canUploadDocument = can(Role.BoardUploader)
  const canManageBoard = can(Role.BoardValidator)

  return withScope(congregationId, async db => {
    const folders = await db.boardSection.findMany({
      where: { congregationId },
      include: {
        documents: {
          orderBy: { order: 'asc' },
          where: {
            congregationId,
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
        congregationId,
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
  })
}

export default function BoardLayout({ loaderData }: Route.ComponentProps) {
  const { folders, hightlightedDocuments } = loaderData
  const nonEmptyFolders = folders.filter(folder => folder.documents.length > 0)

  if (nonEmptyFolders.length < 1) {
    return (
      <div className="flex flex-col gap-6">
        <EmptyState icon={FileText} title={m.board_empty_title()} description={m.board_empty_description()} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {hightlightedDocuments.length > 0 && (
        <div className="flex flex-wrap gap-3 max-sm:flex-col">
          {hightlightedDocuments.map(file => (
            <DocumentCard key={file.id} file={file} alreadyViewed={file.viewedBy.length > 0} />
          ))}
        </div>
      )}
      {nonEmptyFolders.map(folder => (
        <div key={folder.id}>
          <h2 className="mb-3 font-bold font-display text-xl tracking-tight">{folder.name}</h2>
          <div className="flex flex-wrap gap-3 max-sm:flex-col">
            {folder.documents.map(file => (
              <DocumentCard key={file.id} file={file} alreadyViewed={file.viewedBy.length > 0} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
