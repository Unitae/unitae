import { FileText, FolderOpen, Megaphone } from 'lucide-react'
import { Link } from 'react-router'
import { getContentVersion, getDynamicPreview } from '~/features/display-board/server/dynamic-documents.server'
import { BoardSection } from '~/features/display-board/ui/BoardSection'
import { DocumentCard, type DocumentCardItem } from '~/features/display-board/ui/DocumentCard'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { usePersistedState } from '~/shared/hooks/use-persisted-state'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'

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

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canUploadDocument = permissions.has(Role.BoardUploader)
  const canManageBoard = permissions.has(Role.BoardValidator)

  return withScopeFromContext(context, async db => {
    const congregationId = currentUser.congregationId
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
            // biome-ignore lint/style/useNamingConvention: prisma ORM
            _count: { select: { versions: true } },
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
        // biome-ignore lint/style/useNamingConvention: prisma ORM
        _count: { select: { versions: true } },
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

    // Build dynamic doc card items with unread computation and previews
    const allDynamicDocs = [...dynamicDocuments, ...highlightedDynamicDocuments]
    const uniqueDynamicDocs = allDynamicDocs.filter((d, i, arr) => arr.findIndex(x => x.id === d.id) === i)
    const [contentVersionEntries, previewEntries] = await Promise.all([
      Promise.all(
        uniqueDynamicDocs.map(
          async d => [d.id, await getContentVersion(db, d.dynamicType, d.dynamicRef, congregationId)] as const,
        ),
      ),
      Promise.all(
        uniqueDynamicDocs.map(
          async d => [d.id, await getDynamicPreview(db, d.dynamicType, d.dynamicRef, congregationId)] as const,
        ),
      ),
    ])
    const contentVersions = new Map(contentVersionEntries)
    const dynamicPreviews = new Map(previewEntries)

    const buildDynamicCard = (d: (typeof dynamicDocuments)[number]): DocumentCardItem => ({
      kind: 'dynamic',
      id: d.id,
      title: d.title,
      createdAt: d.createdAt,
      dynamicType: d.dynamicType,
      preview: dynamicPreviews.get(d.id) ?? null,
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
          hasUpdate: d._count.versions > 0,
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
          hasUpdate: d._count.versions > 0,
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
  const { folders, highlighted, canManageBoard } = loaderData
  const [collapsed, setCollapsed] = usePersistedState<Record<number, boolean>>('board-collapsed', {})

  const visibleFolders = canManageBoard ? folders : folders.filter(f => f.items.length > 0)

  const toggleCollapse = (folderId: number) => {
    setCollapsed({ ...collapsed, [folderId]: !collapsed[folderId] })
  }

  if (visibleFolders.length === 0 && highlighted.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {canManageBoard ? (
          <EmptyState
            icon={FileText}
            title={m.board_empty_manager_title()}
            description={m.board_empty_manager_description()}
            action={
              <Button asChild>
                <Link to="./sections">{m.board_empty_manager_action()}</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState icon={FileText} title={m.board_empty_title()} description={m.board_empty_description()} />
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.board_page_title()}
        actions={
          canManageBoard ? (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link to="./sections">
                  <FolderOpen className="size-4" />
                  {m.board_manage_sections()}
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="./documents">
                  <FileText className="size-4" />
                  {m.board_manage_documents()}
                </Link>
              </Button>
            </>
          ) : undefined
        }
      />

      {highlighted.length > 0 && (
        <section
          className="animate-fade-in-up rounded-xl border border-primary/20 bg-primary/5 p-4"
          style={{ animationDelay: '100ms' }}
        >
          <div className="mb-3 flex items-center gap-2">
            <Megaphone className="size-5 text-primary" />
            <h2 className="font-bold font-display text-lg tracking-tight">{m.board_highlighted_heading()}</h2>
            <Badge variant="outline" className="text-xs">
              {highlighted.length}
            </Badge>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3 max-sm:grid-cols-1">
            {highlighted.map(file => (
              <DocumentCard
                key={`${file.kind}-${file.id}`}
                file={file}
                variant="highlighted"
                alreadyViewed={file.alreadyViewed}
              />
            ))}
          </div>
        </section>
      )}

      {visibleFolders.map((folder, index) => (
        <div
          key={folder.id}
          className="animate-fade-in-up"
          style={{ animationDelay: `${(index + (highlighted.length > 0 ? 2 : 1)) * 100}ms` }}
        >
          <BoardSection
            name={folder.name}
            items={folder.items}
            isCollapsed={collapsed[folder.id] ?? false}
            onToggleCollapse={() => toggleCollapse(folder.id)}
            canManageBoard={canManageBoard}
          />
        </div>
      ))}
    </div>
  )
}
