import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Eye, FileText, GripVertical, Pencil, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, Form as RouterForm, redirect, useFetcher, useRevalidator, useSearchParams } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { DocumentVisibility } from '~/features/board/ui/DocumentVisibility'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { Input } from '~/shared/ui/input'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Liste des documents du Tableau d'affichage - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardUploader])
  const canUploadDocument = can(Role.BoardUploader)

  if (!canUploadDocument) {
    logger.warn(`Tried to load board documents. User ID: ${currentUser.id}. Does NOT have rights to upload document.`)

    throw redirect('/')
  }

  logger.info(
    `Loading board documents. User ID: ${currentUser.id}. ${canUploadDocument ? 'Has' : 'Does NOT have'} rights to upload document.`,
  )

  const url = new URL(request.url)
  const searchQuery = url.searchParams.get('q') ?? ''
  const filterSectionId = url.searchParams.get('sectionId')

  return withScope(congregationId, async db => {
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

    return { documents, sections }
  })
}

type DocumentItem = Awaited<ReturnType<typeof loader>>['documents'][number]

function SortableDocumentRow({
  document,
  selected,
  onToggle,
}: {
  document: DocumentItem
  selected: boolean
  onToggle: (id: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: document.id,
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
          onChange={() => onToggle(document.id)}
          className="size-4 rounded border border-input accent-primary"
        />
      </TableCell>
      <TableCell>{document.title}</TableCell>
      <TableCell className="max-sm:hidden">{document.section.name}</TableCell>
      <TableCell className="hidden max-sm:table-cell">{(document.section.order ?? 0) / 5 + 1}</TableCell>
      <TableCell className="text-center max-sm:hidden">{document.viewedBy.length}</TableCell>
      <TableCell className="text-center">
        <DocumentVisibility document={document} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" asChild>
            <Link reloadDocument to={`./${document.id}/view`}>
              <Eye className="size-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <Link to={`./${document.id}/edit`}>
              <Pencil className="size-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild className="text-destructive hover:text-destructive max-sm:hidden">
            <Link to={`./${document.id}/delete`} title={m.board_documents_delete_tooltip()}>
              <Trash2 className="size-4" />
            </Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

export default function DocumentListPage({ loaderData }: Route.ComponentProps) {
  const { documents, sections } = loaderData
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
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(documents.map(d => d.id)))
    }
  }

  function handleBulkDelete() {
    bulkFetcher.submit(
      { ids: [...selectedIds] },
      { method: 'POST', action: '/board/documents/bulk-delete', encType: 'application/json' },
    )
    setSelectedIds(new Set())
    revalidator.revalidate()
  }

  function handleBulkMove(sectionId: number) {
    bulkFetcher.submit(
      { ids: [...selectedIds], sectionId },
      { method: 'POST', action: '/board/documents/bulk-move', encType: 'application/json' },
    )
    setSelectedIds(new Set())
    revalidator.revalidate()
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = documents.findIndex(d => d.id === active.id)
    const newIndex = documents.findIndex(d => d.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    // Only reorder within the same section
    if (documents[oldIndex].sectionId !== documents[newIndex].sectionId) return

    const sectionId = documents[oldIndex].sectionId
    const sectionDocs = documents.filter(d => d.sectionId === sectionId)
    const oldSectionIndex = sectionDocs.findIndex(d => d.id === active.id)
    const newSectionIndex = sectionDocs.findIndex(d => d.id === over.id)

    const reordered = [...sectionDocs]
    const [moved] = reordered.splice(oldSectionIndex, 1)
    reordered.splice(newSectionIndex, 0, moved)

    fetcher.submit(
      { orderedIds: reordered.map(d => d.id) },
      { method: 'POST', action: '/board/documents/reorder', encType: 'application/json' },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Documents"
        subtitle={m.board_documents_list_subtitle()}
        actions={
          <Button asChild>
            <Link to="./new">{m.board_documents_upload_button()}</Link>
          </Button>
        }
      />

      <RouterForm method="get" className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            type="search"
            placeholder={m.board_documents_search_placeholder()}
            defaultValue={searchParams.get('q') ?? ''}
            className="pl-9"
          />
        </div>
        <select
          name="sectionId"
          defaultValue={searchParams.get('sectionId') ?? ''}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-48"
        >
          <option value="">{m.board_documents_filter_all_sections()}</option>
          {sections.map(section => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          {m.board_documents_search_button()}
        </Button>
      </RouterForm>

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={m.board_documents_empty_title()}
          description={m.board_documents_empty_description()}
        />
      ) : (
        <>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
              <span className="text-sm text-muted-foreground">
                {m.board_documents_bulk_selected({ count: selectedIds.size })}
              </span>
              <select
                onChange={e => {
                  if (e.target.value) handleBulkMove(Number(e.target.value))
                  e.target.value = ''
                }}
                className="flex h-8 rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  {m.board_documents_bulk_move_to()}
                </option>
                {sections.map(section => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
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
                      <span className="sr-only">{m.board_documents_table_position()}</span>
                    </TableHead>
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === documents.length && documents.length > 0}
                        onChange={toggleAll}
                        className="size-4 rounded border border-input accent-primary"
                      />
                    </TableHead>
                    <TableHead>{m.board_documents_table_name()}</TableHead>
                    <TableHead>
                      <span className="max-sm:hidden">{m.board_documents_table_section()}</span>
                      <span className="hidden max-sm:inline" aria-hidden="true">
                        Sec.
                      </span>
                    </TableHead>
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
                <SortableContext items={documents.map(d => d.id)} strategy={verticalListSortingStrategy}>
                  <TableBody>
                    {documents.map(document => (
                      <SortableDocumentRow
                        key={document.id}
                        document={document}
                        selected={selectedIds.has(document.id)}
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
