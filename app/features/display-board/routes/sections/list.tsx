import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { FolderOpen, GripVertical, Pencil, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, Form as RouterForm, redirect, useFetcher, useRevalidator, useSearchParams } from 'react-router'
import * as m from '~/paraglide/messages'
import logger from '~/shared/infra/logger.server'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { Input } from '~/shared/ui/input'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Liste des sections du Tableau d'affichage - Unitae` }]
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManageBoard = permissions.has(Role.BoardValidator)

  if (!canManageBoard) {
    logger.warn(`Tried to load board sections. User ID: ${currentUser.id}. Does NOT have rights to manage board.`)

    throw redirect('/')
  }

  logger.info(
    `Loading board sections. User ID: ${currentUser.id}. ${canManageBoard ? 'Has' : 'Does NOT have'} rights to manage board sections.`,
  )

  const url = new URL(request.url)
  const searchQuery = url.searchParams.get('q') ?? ''

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const sections = await db.boardSection.findMany({
      where: {
        congregationId,
        ...(searchQuery ? { name: { contains: searchQuery, mode: 'insensitive' as const } } : {}),
      },
      include: {
        documents: true,
      },
      orderBy: {
        order: 'asc',
      },
    })

    return { sections }
  })
}

type SectionItem = Awaited<ReturnType<typeof loader>>['sections'][number]

function SortableSectionRow({
  section,
  selected,
  onToggle,
}: {
  section: SectionItem
  selected: boolean
  onToggle: (id: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

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
          onChange={() => onToggle(section.id)}
          className="size-4 rounded border border-input accent-primary"
        />
      </TableCell>
      <TableCell>{section.name}</TableCell>
      <TableCell className="text-center max-sm:hidden">{section.documents.length}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" asChild>
            <Link to={`./${section.id}/edit`}>
              <Pencil className="size-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild className="text-destructive hover:text-destructive max-sm:hidden">
            <Link to={`./${section.id}/delete`} title={m.board_sections_delete_tooltip()}>
              <Trash2 className="size-4" />
            </Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

export default function SectionListPage({ loaderData }: Route.ComponentProps) {
  const { sections } = loaderData
  const fetcher = useFetcher()
  const bulkFetcher = useFetcher()
  const revalidator = useRevalidator()
  const [searchParams] = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  function toggleSelection(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === sections.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sections.map(s => s.id)))
    }
  }

  function handleBulkDelete() {
    bulkFetcher.submit(
      { ids: [...selectedIds] },
      { method: 'POST', action: '/board/sections/bulk-delete', encType: 'application/json' },
    )
    setSelectedIds(new Set())
    revalidator.revalidate()
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = sections.findIndex(s => s.id === active.id)
    const newIndex = sections.findIndex(s => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = [...sections]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)

    fetcher.submit(
      { orderedIds: reordered.map(s => s.id) },
      { method: 'POST', action: '/board/sections/reorder', encType: 'application/json' },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sections"
        subtitle={m.board_sections_list_subtitle()}
        actions={
          <Button asChild>
            <Link to="./new">{m.board_sections_create_button()}</Link>
          </Button>
        }
      />

      <RouterForm method="get" className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            type="search"
            placeholder={m.board_sections_search_placeholder()}
            defaultValue={searchParams.get('q') ?? ''}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          {m.board_documents_search_button()}
        </Button>
      </RouterForm>

      {sections.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={m.board_sections_empty_title()}
          description={m.board_sections_empty_description()}
        />
      ) : (
        <>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
              <span className="text-muted-foreground text-sm">
                {m.board_sections_bulk_selected({ count: selectedIds.size })}
              </span>
              <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                {m.board_documents_bulk_delete()}
              </Button>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border">
            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <span className="sr-only">{m.board_sections_table_position()}</span>
                    </TableHead>
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === sections.length && sections.length > 0}
                        onChange={toggleAll}
                        className="size-4 rounded border border-input accent-primary"
                      />
                    </TableHead>
                    <TableHead>{m.board_sections_table_name()}</TableHead>
                    <TableHead className="text-center max-sm:hidden">{m.board_sections_table_documents()}</TableHead>
                    <TableHead className="w-0">
                      <span className="sr-only">{m.board_sections_table_actions()}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <TableBody>
                    {sections.map(section => (
                      <SortableSectionRow
                        key={section.id}
                        section={section}
                        selected={selectedIds.has(section.id)}
                        onToggle={toggleSelection}
                      />
                    ))}
                  </TableBody>
                </SortableContext>
              </Table>
            </DndContext>
          </div>
        </>
      )}
    </div>
  )
}
