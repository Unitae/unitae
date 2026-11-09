import { SelectionBar } from '@unitae/ui'
import type { ManagedItem } from '~/features/display-board/server/board-management.queries'
import { canHighlightItem, type ManageRights } from '~/features/display-board/ui/manage/manage-rights'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'

interface ManageSelectionBarProps {
  selected: ManagedItem[]
  sections: { id: number; name: string }[]
  rights: ManageRights
  onMove: (sectionId: number) => void
  onHighlight: (highlighted: boolean) => void
  onDelete: () => void
  onClear: () => void
}

/**
 * What a selection can do: move it, put it « à la une » or take it off, delete it. « À la une »
 * shows only when every selected document is one this person may set it on.
 */
export function ManageSelectionBar({
  selected,
  sections,
  rights,
  onMove,
  onHighlight,
  onDelete,
  onClear,
}: ManageSelectionBarProps) {
  const canHighlight = selected.length > 0 && selected.every(item => canHighlightItem(item, rights))
  const allHighlighted = selected.every(item => item.isHighlighted)

  return (
    <SelectionBar
      label={m.board_manage_selected({ count: selected.length })}
      onClear={onClear}
      clearLabel={m.board_manage_clear_selection()}
      aria-label={m.board_manage_selection_actions()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            {m.board_manage_move_to()}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top">
          {sections.map(section => (
            <DropdownMenuItem key={section.id} onSelect={() => onMove(section.id)}>
              {section.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {canHighlight && (
        <Button variant="ghost" size="sm" onClick={() => onHighlight(!allHighlighted)}>
          {allHighlighted ? m.board_manage_unhighlight() : m.board_manage_highlight()}
        </Button>
      )}
      <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
        {m.board_documents_bulk_delete()}
      </Button>
    </SelectionBar>
  )
}
