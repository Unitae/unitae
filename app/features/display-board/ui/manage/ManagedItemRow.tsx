import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ProgressRing, Tag } from '@unitae/ui'
import { Eye, GripVertical, Pencil } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import type { ManagedItem } from '~/features/display-board/server/board-management.queries'
import { type ItemCallbacks, ManagedItemMenu } from '~/features/display-board/ui/manage/ManagedItemMenu'
import { canEditItem, itemKey, itemPaths, type ManageRights } from '~/features/display-board/ui/manage/manage-rights'
import { StateLabel } from '~/features/display-board/ui/manage/StateLabel'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { RelativeTime } from '~/shared/ui/RelativeTime'
import { ROW_ACTION_REVEAL } from '~/shared/ui/row-click'
import { cn } from '~/shared/utils/utils'

const cellClass = 'h-10 whitespace-nowrap border-border border-b px-3.5'
const wideOnly = 'max-md:hidden'

function ReadsButton({ item, open }: { item: ManagedItem; open: boolean }) {
  const [searchParams] = useSearchParams()
  const next = new URLSearchParams(searchParams)
  next.set('lectures', itemKey(item))
  return (
    <Link
      to={{ search: next.toString() }}
      preventScrollReset
      className={cn(
        '-mx-1.5 inline-flex h-7 items-center gap-2 rounded-md px-1.5 text-sm tabular-nums outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring',
        open && 'bg-hover',
      )}
    >
      {/* A share column: a ring before the figure, never a bar (decided 12 Nov). */}
      <ProgressRing value={item.read} max={item.audience} />
      {m.board_reads_count({ read: item.read, audience: item.audience })}
    </Link>
  )
}

function kindLabel(item: ManagedItem) {
  return item.kind === 'pdf' ? m.board_manage_kind_pdf() : m.board_manage_kind_dynamic()
}

interface ManagedItemRowProps {
  item: ManagedItem
  rights: ManageRights
  selected: boolean
  onToggle: () => void
  readsOpen: boolean
  timeZone: string
  compact?: boolean
  canShiftUp: boolean
  canShiftDown: boolean
  moveTargets: { id: number; name: string }[]
  callbacks: ItemCallbacks
}

export function ManagedItemRow({
  item,
  rights,
  selected,
  onToggle,
  readsOpen,
  timeZone,
  compact = false,
  canShiftUp,
  canShiftDown,
  moveTargets,
  callbacks,
}: ManagedItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itemKey(item),
    disabled: !rights.canOrganise,
  })
  const editable = canEditItem(item, rights)
  const to = itemPaths(item)

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group transition-colors hover:bg-hover max-md:flex max-md:flex-wrap max-md:items-center max-md:border-border max-md:border-b max-md:py-2',
        selected && 'bg-selected hover:bg-selected',
        isDragging && 'relative z-10 bg-surface shadow-sm',
      )}
    >
      {/* Selection and reordering are desktop work: on a phone, no checkbox and no handle. */}
      {rights.canOrganise && (
        <td className={cn(cellClass, 'pr-0 max-md:hidden')}>
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              className="cursor-grab touch-none text-faint opacity-40 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-md:hidden"
              aria-label={m.board_manage_drag({ title: item.title })}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" aria-hidden="true" />
            </button>
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-primary)]"
              checked={selected}
              onChange={onToggle}
              aria-label={m.board_manage_select({ title: item.title })}
            />
          </span>
        </td>
      )}
      <td className={cn(cellClass, 'max-md:h-auto max-md:min-w-0 max-md:flex-1 max-md:border-0')}>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <Link to={editable ? to.edit : to.view} className="min-w-0 truncate font-medium hover:underline">
              {item.title}
            </Link>
            <span className="shrink-0 text-faint text-xs max-md:hidden">{kindLabel(item)}</span>
            {item.isHighlighted && (
              <Tag tone="brand" className="max-md:hidden">
                {m.board_highlighted_heading()}
              </Tag>
            )}
          </span>
          {/* On a phone the title has its line to itself; the rest, and the reads, come under it. */}
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 md:hidden">
            <StateLabel state={item.state} timeZone={timeZone} />
            <span className="text-faint text-xs">{kindLabel(item)}</span>
            {item.isHighlighted && <Tag tone="brand">{m.board_highlighted_heading()}</Tag>}
            {rights.canReview && <ReadsButton item={item} open={readsOpen} />}
          </span>
        </span>
      </td>
      {/* A long state (« Affiché · jusqu’au 20 nov. ») wraps instead of running under the next cell. */}
      <td className={cn(cellClass, wideOnly, 'whitespace-normal py-2')}>
        <StateLabel state={item.state} timeZone={timeZone} />
      </td>
      <td className={cn(cellClass, wideOnly)}>
        {rights.canReview ? (
          <ReadsButton item={item} open={readsOpen} />
        ) : (
          <span className="text-sm tabular-nums">
            {m.board_reads_count({ read: item.read, audience: item.audience })}
          </span>
        )}
      </td>
      {!compact && (
        <td className={cn(cellClass, wideOnly, 'text-muted-foreground text-sm max-xl:px-0')}>
          <span className="max-xl:hidden">
            <RelativeTime date={item.updatedAt} />
          </span>
        </td>
      )}
      <td className={cn(cellClass, 'text-right max-md:w-auto max-md:border-0')}>
        <span className={cn('inline-flex items-center gap-0.5', ROW_ACTION_REVEAL)}>
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to={to.view} aria-label={m.board_manage_view({ title: item.title })}>
              <Eye className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          {editable && (
            <Button variant="ghost" size="icon-sm" asChild className="max-md:hidden">
              <Link to={to.edit} aria-label={m.board_manage_edit({ title: item.title })}>
                <Pencil className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          )}
          <ManagedItemMenu
            item={item}
            rights={rights}
            canShiftUp={canShiftUp}
            canShiftDown={canShiftDown}
            moveTargets={moveTargets}
            callbacks={callbacks}
          />
        </span>
      </td>
    </tr>
  )
}
