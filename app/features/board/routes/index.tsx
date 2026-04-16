import { FileText } from 'lucide-react'
import { Role } from '~/features/authorization/model/roles.type'
import { getContentVersion } from '~/features/board/server/dynamic-documents.server'
import { DocumentCard, type DocumentCardItem } from '~/features/board/ui/DocumentCard'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { EmptyState } from '~/shared/ui/EmptyState'

import type { Route } from './+types/index'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Tableau d'affichage - Unitae` }]
}

const visibleNow = () => {
  const now = new Date()
  return {
    // biome-ignore lint/style/useNamingConvention: prisma ORM
    OR: [
      { visibleFrom: { lte: now }, visibleUntil: { gte: now } },
      { visibleFrom: { lte: now }, visibleUntil: null },
    ],
  }
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
            ...visibleNow(),
          },
          include: {
            viewedBy: {
              where: { id: { equals: currentUser.id } },
            },
          },
        },
      },
      orderBy: { order: 'asc' },
    })

    const dynamicDocuments = await db.boardDynamicDocumentSettings.findMany({
      where: {
        congregationId,
        ...visibleNow(),
      },
      include: {
        views: {
          where: { userId: currentUser.id },
        },
      },
      orderBy: { order: 'asc' },
    })

    const hightlightedDocuments = await db.boardDocument.findMany({
      where: {
        congregationId,
        isHighlighted: true,
        ...visibleNow(),
      },
      orderBy: { order: 'asc' },
      include: {
        viewedBy: {
          where: { id: { equals: currentUser.id } },
        },
      },
    })

    const highlightedDynamicDocuments = await db.boardDynamicDocumentSettings.findMany({
      where: {
        congregationId,
        isHighlighted: true,
        ...visibleNow(),
      },
      include: {
        views: {
          where: { userId: currentUser.id },
        },
      },
      orderBy: { order: 'asc' },
    })

    // Build dynamic doc card items with unread computation
    const allDynamicDocs = [...dynamicDocuments, ...highlightedDynamicDocuments]
    const contentVersions = new Map<number, Date | null>()
    for (const d of allDynamicDocs) {
      if (!contentVersions.has(d.id)) {
        contentVersions.set(d.id, await getContentVersion(db, d.dynamicType, d.dynamicRef, congregationId))
      }
    }

    const buildDynamicCard = (d: (typeof dynamicDocuments)[number]): DocumentCardItem => ({
      kind: 'dynamic',
      id: d.id,
      title: d.title,
      createdAt: d.createdAt,
      dynamicType: d.dynamicType,
    })

    const isDynamicAlreadyViewed = (d: (typeof dynamicDocuments)[number]): boolean => {
      const viewedAt = d.views[0]?.viewedAt ?? null
      if (viewedAt == null) return false
      const contentVersion = contentVersions.get(d.id) ?? null
      if (contentVersion == null) return true
      return viewedAt >= contentVersion
    }

    logger.info(
      `Loading board. User ID: ${currentUser.id}. ${canUploadDocument ? 'Has' : 'Does NOT have'} rights to update the board.`,
    )

    return {
      folders: folders.map(folder => {
        const pdfItems = folder.documents.map(d => ({
          kind: 'pdf' as const,
          id: d.id,
          title: d.title,
          createdAt: d.createdAt,
          thumbnailUri: d.thumbnailUri,
          order: d.order,
          alreadyViewed: d.viewedBy.length > 0,
        }))
        const dynItems = dynamicDocuments
          .filter(d => d.sectionId === folder.id)
          .map(d => ({
            ...buildDynamicCard(d),
            order: d.order,
            alreadyViewed: isDynamicAlreadyViewed(d),
          }))
        const items = [...pdfItems, ...dynItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        return {
          id: folder.id,
          name: folder.name,
          order: folder.order,
          items,
        }
      }),
      highlighted: [
        ...hightlightedDocuments.map(d => ({
          kind: 'pdf' as const,
          id: d.id,
          title: d.title,
          createdAt: d.createdAt,
          thumbnailUri: d.thumbnailUri,
          alreadyViewed: d.viewedBy.length > 0,
        })),
        ...highlightedDynamicDocuments.map(d => ({
          ...buildDynamicCard(d),
          alreadyViewed: isDynamicAlreadyViewed(d),
        })),
      ],
      canUploadDocument,
      canManageBoard,
    }
  })
}

export default function BoardLayout({ loaderData }: Route.ComponentProps) {
  const { folders, highlighted } = loaderData
  const nonEmptyFolders = folders.filter(folder => folder.items.length > 0)

  if (nonEmptyFolders.length < 1 && highlighted.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <EmptyState icon={FileText} title={m.board_empty_title()} description={m.board_empty_description()} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {highlighted.length > 0 && (
        <div className="flex flex-wrap gap-3 max-sm:flex-col">
          {highlighted.map(file => (
            <DocumentCard key={`${file.kind}-${file.id}`} file={file} alreadyViewed={file.alreadyViewed} />
          ))}
        </div>
      )}
      {nonEmptyFolders.map(folder => (
        <div key={folder.id}>
          <h2 className="mb-3 font-bold font-display text-xl tracking-tight">{folder.name}</h2>
          <div className="flex flex-wrap gap-3 max-sm:flex-col">
            {folder.items.map(file => (
              <DocumentCard key={`${file.kind}-${file.id}`} file={file} alreadyViewed={file.alreadyViewed} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
