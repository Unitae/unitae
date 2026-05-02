import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BarChart3, Eye, FileText, GripVertical, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, redirect, useFetcher, useRevalidator, useSearchParams } from 'react-router'
import { DocumentVisibility } from '~/features/display-board/ui/DocumentVisibility'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SearchInput } from '~/shared/ui/SearchInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Liste des documents du Tableau d'affichage - Unitae` }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canUploadDocument = permissions.has(Role.BoardUploader)

  if (!canUploadDocument) {
    logger.warn(`Tried to load board documents. User ID: ${currentUser.id}. Does NOT have rights to upload document.`)

    throw redirect('/')
  }

  logger.info(
    `Loading board documents. User ID: ${currentUser.id}. ${canUploadDocument ? 'Has' : 'Does NOT have'} rights to upload document.`,
  )

  const url = new URL(request.url)
  const searchQuery = url.searchParams.get('q') ?? ''
  const sectionIdParam = url.searchParams.get('sectionId')
  const filterSectionId = sectionIdParam && sectionIdParam !== 'all' ? sectionIdParam : null

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const sections = await db.boardSection.findMany({
      where: { congregationId },
      orderBy: { order: 'asc' },
    })

    const documents = await db.boardDocument.findMany({
      where: {
        congregationId,
        ...(searchQuery ? { title: { contains: searchQuery, mode: 'insensitive' as const } } : {}),
        ...(filterSectionId ? { sectionId: Number(filterSectionId) } : {}),
      },
      include: {
        section: true,
        viewedBy: { select: { id: true } },
      },
    })

    const dynamicDocuments = await db.boardDynamicDocumentSettings.findMany({
      where: {
        congregationId,
        ...(searchQuery ? { title: { contains: searchQuery, mode: 'insensitive' as const } } : {}),
        ...(filterSectionId ? { sectionId: Number(filterSectionId) } : {}),
      },
      include: { section: true },
    })

    return { documents, dynamicDocuments, sections }
  })
}

type Kind = 'pdf' | 'dyn'

type UnifiedItem = {
  kind: Kind
  id: number
  dndId: string
  title: string
  sectionId: number
  sectionName: string
  sectionOrder: number | null
  order: number | null
  visibleFrom: Date | null
  visibleUntil: Date | null
  isHighlighted: boolean
  viewsCount: number | null
}

function buildDndId(kind: Kind, id: number): string {
  return `${kind}-${id}`
}

function parseDndId(dndId: string): { kind: Kind; id: number } {
  const [kind, rest] = dndId.split('-', 2)
  return { kind: kind as Kind, id: Number(rest) }
}

function mergeAndSort(
  pdfs: Awaited<ReturnType<typeof loader>>['documents'],
  dyns: Awaited<ReturnType<typeof loader>>['dynamicDocuments'],
): UnifiedItem[] {
  const items: UnifiedItem[] = [
    ...pdfs.map<UnifiedItem>(d => ({
      kind: 'pdf',
      id: d.id,
      dndId: buildDndId('pdf', d.id),
      title: d.title,
      sectionId: d.sectionId,
      sectionName: d.section.name,
      sectionOrder: d.section.order,
      order: d.order,
      visibleFrom: d.visibleFrom,
      visibleUntil: d.visibleUntil,
      isHighlighted: d.isHighlighted,
      viewsCount: d.viewedBy.length,
    })),
    ...dyns.map<UnifiedItem>(d => ({
      kind: 'dyn',
      id: d.id,
      dndId: buildDndId('dyn', d.id),
      title: d.title,
      sectionId: d.sectionId,
      sectionName: d.section.name,
      sectionOrder: d.section.order,
      order: d.order,
      visibleFrom: d.visibleFrom,
      visibleUntil: d.visibleUntil,
      isHighlighted: d.isHighlighted,
      viewsCount: null,
    })),
  ]
  items.sort((a, b) => {
    const secA = a.sectionOrder ?? 0
    const secB = b.sectionOrder ?? 0
    if (secA !== secB) return secA - secB
    const ordA = a.order ?? 0
    const ordB = b.order ?? 0
    return ordA - ordB
  })
  return items
}

function SortableItemRow({
  item,
  selected,
  onToggle,
}: {
  item: UnifiedItem
  selected: boolean
  onToggle: (dndId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.dndId,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const editHref = item.kind === 'pdf' ? `./${item.id}/edit` : `/board/dynamic/${item.id}/edit`
  const viewerHref = item.kind === 'pdf' ? `./${item.id}/viewer` : `/board/dynamic/${item.id}/viewer`
  const deleteHref = item.kind === 'pdf' ? `./${item.id}/delete` : `/board/dynamic/${item.id}/delete`

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-8">
        <button type="button" className="cursor-grab touch-none text-muted-foreground" {...attributes} {...listeners}>
          <GripVertical className="size-4" />
        </button>
      </TableCell>
      <TableCell className="w-8">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(item.dndId)}
          className="size-4 rounded border border-input accent-primary"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span>{item.title}</span>
          {item.kind === 'dyn' && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
              {m.board_dynamic_badge()}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-center max-sm:hidden">{item.viewsCount ?? '—'}</TableCell>
      <TableCell className="text-center">
        <DocumentVisibility document={item} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" asChild>
            <Link to={viewerHref}>
              <Eye className="size-4" />
            </Link>
          </Button>
          {item.kind === 'pdf' && (
            <Button variant="ghost" size="icon" asChild>
              <Link to={`./${item.id}/read-status`} title={m.board_read_status_link_tooltip()}>
                <BarChart3 className="size-4" />
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="icon" asChild>
            <Link to={editHref}>
              <Pencil className="size-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild className="text-destructive hover:text-destructive max-sm:hidden">
            <Link to={deleteHref} title={m.board_documents_delete_tooltip()}>
              <Trash2 className="size-4" />
            </Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

export default function DocumentListPage({ loaderData }: Route.ComponentProps) {
  const { documents, dynamicDocuments, sections } = loaderData
  const fetcher = useFetcher()
  const bulkFetcher = useFetcher()
  const revalidator = useRevalidator()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const items = mergeAndSort(documents, dynamicDocuments)
  const sectionsWithItems = sections
    .map(section => ({
      section,
      sectionItems: items.filter(i => i.sectionId === section.id),
    }))
    .filter(({ sectionItems }) => sectionItems.length > 0)

  function toggleSelection(dndId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(dndId)) next.delete(dndId)
      else next.add(dndId)
      return next
    })
  }

  function toggleAllInSection(sectionItems: UnifiedItem[]) {
    const allSelected = sectionItems.every(i => selectedIds.has(i.dndId))
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        for (const item of sectionItems) next.delete(item.dndId)
      } else {
        for (const item of sectionItems) next.add(item.dndId)
      }
      return next
    })
  }

  function handleBulkDelete() {
    const selected = [...selectedIds].map(parseDndId)
    bulkFetcher.submit(
      { items: selected },
      { method: 'POST', action: '/board/documents/bulk-delete', encType: 'application/json' },
    )
    setSelectedIds(new Set())
    revalidator.revalidate()
  }

  function handleBulkMove(sectionId: number) {
    const selected = [...selectedIds].map(parseDndId)
    bulkFetcher.submit(
      { items: selected, sectionId },
      { method: 'POST', action: '/board/documents/bulk-move', encType: 'application/json' },
    )
    setSelectedIds(new Set())
    revalidator.revalidate()
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeIndex = items.findIndex(i => i.dndId === active.id)
    const overIndex = items.findIndex(i => i.dndId === over.id)
    if (activeIndex === -1 || overIndex === -1) return

    // Only reorder within the same section
    if (items[activeIndex].sectionId !== items[overIndex].sectionId) return

    const sectionId = items[activeIndex].sectionId
    const sectionItems = items.filter(i => i.sectionId === sectionId)
    const oldSectionIndex = sectionItems.findIndex(i => i.dndId === active.id)
    const newSectionIndex = sectionItems.findIndex(i => i.dndId === over.id)

    const reordered = [...sectionItems]
    const [moved] = reordered.splice(oldSectionIndex, 1)
    reordered.splice(newSectionIndex, 0, moved)

    fetcher.submit(
      { orderedItems: reordered.map(i => ({ kind: i.kind, id: i.id })) },
      { method: 'POST', action: '/board/documents/reorder', encType: 'application/json' },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Documents"
        subtitle={m.board_documents_list_subtitle()}
        breadcrumbs={[{ label: m.sidebar_documents() }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="./new-dynamic">
                <Sparkles className="mr-2 size-4" />
                {m.board_add_dynamic_button()}
              </Link>
            </Button>
            <Button asChild>
              <Link to="./new">{m.board_documents_upload_button()}</Link>
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchInput placeholder={m.board_documents_search_placeholder()} />
        <Select
          value={searchParams.get('sectionId') || 'all'}
          onValueChange={value => {
            setSearchParams(prev => {
              if (value === 'all') {
                prev.delete('sectionId')
              } else {
                prev.set('sectionId', value)
              }
              return prev
            })
          }}
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{m.board_documents_filter_all_sections()}</SelectItem>
            {sections.map(section => (
              <SelectItem key={section.id} value={String(section.id)}>
                {section.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={m.board_documents_empty_title()}
          description={m.board_documents_empty_description()}
        />
      ) : (
        <>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
              <span className="text-muted-foreground text-sm">
                {m.board_documents_bulk_selected({ count: selectedIds.size })}
              </span>
              <Select
                value=""
                onValueChange={value => {
                  if (value) handleBulkMove(Number(value))
                }}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder={m.board_documents_bulk_move_to()} />
                </SelectTrigger>
                <SelectContent>
                  {sections.map(section => (
                    <SelectItem key={section.id} value={String(section.id)}>
                      {section.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                {m.board_documents_bulk_delete()}
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-6">
            {sectionsWithItems.map(({ section, sectionItems }) => (
              <SectionBlock
                key={section.id}
                section={section}
                items={sectionItems}
                allSelected={sectionItems.every(i => selectedIds.has(i.dndId)) && sectionItems.length > 0}
                selectedIds={selectedIds}
                onToggleAllInSection={() => toggleAllInSection(sectionItems)}
                onToggle={toggleSelection}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SectionBlock({
  section,
  items,
  allSelected,
  selectedIds,
  onToggleAllInSection,
  onToggle,
  onDragEnd,
}: {
  section: { id: number; name: string }
  items: UnifiedItem[]
  allSelected: boolean
  selectedIds: Set<string>
  onToggleAllInSection: () => void
  onToggle: (dndId: string) => void
  onDragEnd: (event: DragEndEvent) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display font-semibold text-lg">{section.name}</h2>
      <div className="overflow-hidden rounded-xl border">
        <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <span className="sr-only">{m.board_documents_table_position()}</span>
                </TableHead>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleAllInSection}
                    className="size-4 rounded border border-input accent-primary"
                  />
                </TableHead>
                <TableHead>{m.board_documents_table_name()}</TableHead>
                <TableHead className="text-center max-sm:hidden">{m.board_documents_table_views()}</TableHead>
                <TableHead className="text-center">
                  <span className="max-sm:hidden">{m.board_documents_table_visibility()}</span>
                  <span className="hidden max-sm:inline" aria-hidden="true">
                    Vis.
                  </span>
                </TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">{m.board_documents_table_actions()}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <SortableContext items={items.map(i => i.dndId)} strategy={verticalListSortingStrategy}>
              <TableBody>
                {items.map(item => (
                  <SortableItemRow
                    key={item.dndId}
                    item={item}
                    selected={selectedIds.has(item.dndId)}
                    onToggle={onToggle}
                  />
                ))}
              </TableBody>
            </SortableContext>
          </Table>
        </DndContext>
      </div>
    </div>
  )
}
