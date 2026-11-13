import { MoreHorizontal } from 'lucide-react'
import { Fragment, type ReactNode, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { ManagedItem } from '~/features/display-board/server/board-management.queries'
import { DeleteBoardItemDialog } from '~/features/display-board/ui/manage/DeleteBoardItemDialog'
import {
  canEditItem,
  canHighlightItem,
  itemKey,
  itemPaths,
  type ManageRights,
} from '~/features/display-board/ui/manage/manage-rights'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'

export interface ItemCallbacks {
  /** One place up or down among the rows shown. */
  onShift: (item: ManagedItem, direction: -1 | 1) => void
  onMove: (item: ManagedItem, sectionId: number) => void
  onHighlight: (items: ManagedItem[], highlighted: boolean) => void
}

interface ManagedItemMenuProps {
  item: ManagedItem
  rights: ManageRights
  canShiftUp: boolean
  canShiftDown: boolean
  /** The other sections, for « Déplacer vers… ». */
  moveTargets: { id: number; name: string }[]
  callbacks: ItemCallbacks
}

interface Entry {
  key: string
  node: ReactNode
  /** Shown on a phone only, where the row has no pencil. */
  phoneOnly?: boolean
}

/**
 * Everything a row does beyond view and edit, each behind its own right: who read it, its history,
 * « à la une », its place, deleting it. On a phone it also carries what the row has no room for.
 */
export function ManagedItemMenu({
  item,
  rights,
  canShiftUp,
  canShiftDown,
  moveTargets,
  callbacks,
}: ManagedItemMenuProps) {
  const [searchParams] = useSearchParams()
  const [deleting, setDeleting] = useState(false)
  const reads = new URLSearchParams(searchParams)
  reads.set('lectures', itemKey(item))
  const editable = canEditItem(item, rights)
  const to = itemPaths(item)

  const groups: { key: string; entries: (Entry | false)[] }[] = [
    {
      key: 'open',
      entries: [
        editable && {
          key: 'edit',
          phoneOnly: true,
          node: (
            <DropdownMenuItem asChild className="md:hidden">
              <Link to={to.edit}>{m.board_manage_edit_short()}</Link>
            </DropdownMenuItem>
          ),
        },
        rights.canReview && {
          key: 'reads',
          node: (
            <DropdownMenuItem asChild>
              <Link to={{ search: reads.toString() }} preventScrollReset>
                {m.board_reads_title()}
              </Link>
            </DropdownMenuItem>
          ),
        },
        item.kind === 'pdf' &&
          editable && {
            key: 'versions',
            node: (
              <DropdownMenuItem asChild>
                <Link to={to.versions}>{m.board_manage_versions()}</Link>
              </DropdownMenuItem>
            ),
          },
      ],
    },
    {
      key: 'highlight',
      entries: [
        canHighlightItem(item, rights) && {
          key: 'highlight',
          node: (
            <DropdownMenuItem onSelect={() => callbacks.onHighlight([item], !item.isHighlighted)}>
              {item.isHighlighted ? m.board_manage_unhighlight() : m.board_manage_highlight()}
            </DropdownMenuItem>
          ),
        },
      ],
    },
    {
      key: 'place',
      entries: rights.canOrganise
        ? [
            canShiftUp && {
              key: 'up',
              node: (
                <DropdownMenuItem onSelect={() => callbacks.onShift(item, -1)}>
                  {m.board_manage_move_up()}
                </DropdownMenuItem>
              ),
            },
            canShiftDown && {
              key: 'down',
              node: (
                <DropdownMenuItem onSelect={() => callbacks.onShift(item, 1)}>
                  {m.board_manage_move_down()}
                </DropdownMenuItem>
              ),
            },
            moveTargets.length > 0 && {
              key: 'move',
              node: (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>{m.board_manage_move_to()}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {moveTargets.map(section => (
                      <DropdownMenuItem key={section.id} onSelect={() => callbacks.onMove(item, section.id)}>
                        {section.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ),
            },
          ]
        : [],
    },
    {
      key: 'delete',
      entries: [
        editable && {
          key: 'delete',
          node: (
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
              {m.board_manage_delete()}
            </DropdownMenuItem>
          ),
        },
      ],
    },
  ]
  const shown = groups
    .map(group => ({ key: group.key, entries: group.entries.filter((entry): entry is Entry => entry !== false) }))
    .filter(group => group.entries.length > 0)
  if (shown.length === 0) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={m.board_manage_more({ title: item.title })}>
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {shown.map((group, index) => {
            // Above a group, a rule; on a wide screen, none while everything before it is phone-only.
            const phoneOnlyBefore = shown.slice(0, index).every(g => g.entries.every(entry => entry.phoneOnly))
            return (
              <Fragment key={group.key}>
                {index > 0 && <DropdownMenuSeparator className={phoneOnlyBefore ? 'md:hidden' : undefined} />}
                {group.entries.map(entry => (
                  <Fragment key={entry.key}>{entry.node}</Fragment>
                ))}
              </Fragment>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteBoardItemDialog
        item={deleting ? { kind: item.kind, id: item.id, title: item.title } : null}
        onClose={() => setDeleting(false)}
      />
    </>
  )
}
