import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Tag } from '@unitae/ui'
import { MoreHorizontal, Pencil } from 'lucide-react'
import { useId } from 'react'
import { Link, useSubmit } from 'react-router'
import type { ManagedItem } from '~/features/display-board/server/board-management.queries'
import type { ItemCallbacks } from '~/features/display-board/ui/manage/ManagedItemMenu'
import { ManagedItemRow } from '~/features/display-board/ui/manage/ManagedItemRow'
import { itemKey, type ManageRights } from '~/features/display-board/ui/manage/manage-rights'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'
import { cn } from '~/shared/utils/utils'

export interface ManageSection {
  id: number
  name: string
  roles: { id: number; label: string }[]
  items: ManagedItem[]
}

const headClass = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'

function SectionActions({ section, isFirst, isLast }: { section: ManageSection; isFirst: boolean; isLast: boolean }) {
  const submit = useSubmit()
  return (
    <span className="ml-auto flex items-center gap-0.5">
      <Button variant="ghost" size="sm" asChild className="max-md:hidden">
        <Link to={`/board/sections/${section.id}/edit`}>
          <Pencil className="size-3.5" aria-hidden="true" />
          {m.board_manage_edit_section()}
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={m.board_manage_section_more({ name: section.name })}>
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild className="md:hidden">
            <Link to={`/board/sections/${section.id}/edit`}>{m.board_manage_edit_section()}</Link>
          </DropdownMenuItem>
          {/* Submitted from onSelect: the menu closes before a form inside it could submit. */}
          {!isFirst && (
            <DropdownMenuItem
              onSelect={() => submit(null, { method: 'post', action: `/board/sections/${section.id}/move-up` })}
            >
              {m.board_manage_move_up()}
            </DropdownMenuItem>
          )}
          {!isLast && (
            <DropdownMenuItem
              onSelect={() => submit(null, { method: 'post', action: `/board/sections/${section.id}/move-down` })}
            >
              {m.board_manage_move_down()}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="text-destructive">
            <Link to={`/board/sections/${section.id}/delete`}>{m.board_sections_delete_button()}</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}

interface ManageTableProps {
  sections: ManageSection[]
  /** Every section's id in order, unfiltered: what « Monter » and « Descendre » may offer. */
  sectionOrder: number[]
  rights: ManageRights
  selected: Set<string>
  onToggle: (key: string) => void
  onReorder: (items: ManagedItem[]) => void
  readsKey: string | null
  timeZone: string
  /** Beside the reads panel: « Modifié » steps aside so titles keep their room. */
  compact?: boolean
  /** Every section, for a row's « Déplacer vers… » even while a filter shows only one. */
  allSections: { id: number; name: string }[]
  onMove: ItemCallbacks['onMove']
  onHighlight: ItemCallbacks['onHighlight']
}

/**
 * The board as one list: each section a group with who can see it and its own actions, its
 * documents underneath. Rows can be dragged within their section, never across.
 */
export function ManageTable({
  sections,
  sectionOrder,
  rights,
  selected,
  onToggle,
  onReorder,
  readsKey,
  timeZone,
  compact = false,
  allSections,
  onMove,
  onHighlight,
}: ManageTableProps) {
  // A stable id, or dnd-kit numbers its describedby ids differently on the server and the client.
  const dndId = useId()
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const columns = (rights.canOrganise ? 6 : 5) - (compact ? 1 : 0)

  // « Monter » and « Descendre » move a row past its neighbour among the rows shown, as a drag would.
  const shift = (section: ManageSection, item: ManagedItem, direction: -1 | 1) => {
    const from = section.items.findIndex(candidate => itemKey(candidate) === itemKey(item))
    const to = from + direction
    if (from < 0 || to < 0 || to >= section.items.length) return
    const reordered = [...section.items]
    ;[reordered[from], reordered[to]] = [reordered[to], reordered[from]]
    onReorder(reordered)
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const section = sections.find(s => s.items.some(item => itemKey(item) === active.id))
    if (!section?.items.some(item => itemKey(item) === over.id)) return
    const from = section.items.findIndex(item => itemKey(item) === active.id)
    const to = section.items.findIndex(item => itemKey(item) === over.id)
    const reordered = [...section.items]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    onReorder(reordered)
  }

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table
          className={cn(
            'w-full border-collapse text-sm max-md:block md:table-fixed',
            compact ? 'md:min-w-[40rem]' : 'md:min-w-[52rem]',
          )}
        >
          <thead className="max-md:hidden">
            <tr>
              {rights.canOrganise && (
                <th className={cn(headClass, 'w-12 pr-0')}>
                  <span className="sr-only">{m.board_manage_select_all()}</span>
                </th>
              )}
              <th className={headClass}>{m.board_manage_col_document()}</th>
              <th className={cn(headClass, 'w-40')}>{m.board_manage_col_state()}</th>
              <th className={cn(headClass, 'w-32')}>{m.board_manage_col_reads()}</th>
              {!compact && <th className={cn(headClass, 'w-36')}>{m.board_manage_col_updated()}</th>}
              <th className={cn(headClass, 'w-32')}>
                <span className="sr-only">{m.board_manage_col_actions()}</span>
              </th>
            </tr>
          </thead>
          {sections.map(section => (
            <SortableContext key={section.id} items={section.items.map(itemKey)} strategy={verticalListSortingStrategy}>
              <tbody className="max-md:block">
                <tr className="max-md:block">
                  <td
                    colSpan={columns}
                    className="h-10 border-border border-b bg-subtle px-3.5 max-md:block max-md:h-auto max-md:py-2"
                  >
                    <span className="flex items-center gap-2">
                      {/* Wraps on its own, so a narrow screen pushes the roles down rather than the actions. */}
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold">{section.name}</span>
                        <span className="text-faint text-sm tabular-nums">{section.items.length}</span>
                        <span className="ml-1.5 text-faint text-sm max-sm:hidden">{m.board_manage_visible_to()}</span>
                        {section.roles.length === 0 ? (
                          <Tag>{m.board_manage_everyone()}</Tag>
                        ) : (
                          section.roles.map(role => <Tag key={role.id}>{role.label}</Tag>)
                        )}
                      </span>
                      {rights.canConfigureSections && (
                        <SectionActions
                          section={section}
                          isFirst={sectionOrder[0] === section.id}
                          isLast={sectionOrder.at(-1) === section.id}
                        />
                      )}
                    </span>
                  </td>
                </tr>
                {section.items.length === 0 ? (
                  <tr className="max-md:block">
                    <td colSpan={columns} className="h-11 border-border border-b px-3.5 text-faint max-md:block">
                      {m.board_manage_empty_section()}
                    </td>
                  </tr>
                ) : (
                  section.items.map((item, index) => (
                    <ManagedItemRow
                      key={itemKey(item)}
                      item={item}
                      rights={rights}
                      selected={selected.has(itemKey(item))}
                      onToggle={() => onToggle(itemKey(item))}
                      readsOpen={readsKey === itemKey(item)}
                      timeZone={timeZone}
                      compact={compact}
                      canShiftUp={index > 0}
                      canShiftDown={index < section.items.length - 1}
                      moveTargets={allSections.filter(target => target.id !== section.id)}
                      callbacks={{ onShift: (row, direction) => shift(section, row, direction), onMove, onHighlight }}
                    />
                  ))
                )}
              </tbody>
            </SortableContext>
          ))}
        </table>
      </div>
    </DndContext>
  )
}
