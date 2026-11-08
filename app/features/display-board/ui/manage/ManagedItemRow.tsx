import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Tag } from '@unitae/ui'
import { Eye, GripVertical, MoreHorizontal, Pencil } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import type { ManagedItem } from '~/features/display-board/server/board-management.queries'
import { StateLabel } from '~/features/display-board/ui/manage/StateLabel'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'
import { RelativeTime } from '~/shared/ui/RelativeTime'
import { cn } from '~/shared/utils/utils'

export interface ManageRights {
  canUpload: boolean
  canReview: boolean
  canOrganise: boolean
  canConfigureSections: boolean
  canManageDynamic: boolean
}

export const itemKey = (item: Pick<ManagedItem, 'kind' | 'id'>) => `${item.kind}-${item.id}`

/** Each action behind the right its page checks: an uploader edits only the PDFs they uploaded. */
export function canEditItem(item: ManagedItem, rights: ManageRights): boolean {
  if (item.kind === 'dynamic') return rights.canManageDynamic
  return rights.canReview || (rights.canUpload && item.ownedByUser)
}

const cellClass = 'h-11 whitespace-nowrap border-border border-b px-3.5'
const wideOnly = 'max-md:hidden'

function paths(item: ManagedItem) {
  const base = item.kind === 'pdf' ? `/board/documents/${item.id}` : `/board/dynamic/${item.id}`
  return { view: `${base}/viewer`, edit: `${base}/edit`, remove: `${base}/delete`, versions: `${base}/versions` }
}

function ReadsButton({ item, open }: { item: ManagedItem; open: boolean }) {
  const [searchParams] = useSearchParams()
  const next = new URLSearchParams(searchParams)
  next.set('lectures', itemKey(item))
  const share = item.audience > 0 ? Math.round((item.read / item.audience) * 100) : 0

  return (
    <Link
      to={{ search: next.toString() }}
      preventScrollReset
      className={cn(
        '-mx-1.5 inline-flex h-7 items-center gap-2 rounded-md px-1.5 text-sm tabular-nums outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring',
        open && 'bg-hover',
      )}
    >
      {m.board_reads_count({ read: item.read, audience: item.audience })}
      <span aria-hidden="true" className="h-1 w-12 overflow-hidden rounded-full bg-border">
        <span className="block h-full bg-brand" style={{ width: `${share}%` }} />
      </span>
    </Link>
  )
}

interface ManagedItemRowProps {
  item: ManagedItem
  rights: ManageRights
  selected: boolean
  onToggle: () => void
  readsOpen: boolean
  timeZone: string
  compact?: boolean
}

export function ManagedItemRow({
  item,
  rights,
  selected,
  onToggle,
  readsOpen,
  timeZone,
  compact = false,
}: ManagedItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itemKey(item),
    disabled: !rights.canOrganise,
  })
  const editable = canEditItem(item, rights)
  const to = paths(item)

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
      {rights.canOrganise && (
        <td className={cn(cellClass, 'pr-0 max-md:border-0')}>
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
            <span className="shrink-0 text-faint text-xs">
              {item.kind === 'pdf' ? m.board_manage_kind_pdf() : m.board_manage_kind_dynamic()}
            </span>
            {item.isHighlighted && <Tag tone="brand">{m.board_highlighted_heading()}</Tag>}
          </span>
          <span className="md:hidden">
            <StateLabel state={item.state} timeZone={timeZone} />
          </span>
        </span>
      </td>
      <td className={cn(cellClass, wideOnly)}>
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
        <td className={cn(cellClass, wideOnly, 'text-muted-foreground text-sm')}>
          <RelativeTime date={item.updatedAt} />
        </td>
      )}
      <td className={cn(cellClass, 'text-right max-md:w-auto max-md:border-0')}>
        <span className="inline-flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
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
          {editable && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={m.board_manage_more({ title: item.title })}>
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild className="md:hidden">
                  <Link to={to.edit}>{m.board_manage_edit_short()}</Link>
                </DropdownMenuItem>
                {item.kind === 'pdf' && (
                  <DropdownMenuItem asChild>
                    <Link to={to.versions}>{m.board_manage_versions()}</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="text-destructive">
                  <Link to={to.remove}>{m.board_manage_delete()}</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </span>
      </td>
    </tr>
  )
}
