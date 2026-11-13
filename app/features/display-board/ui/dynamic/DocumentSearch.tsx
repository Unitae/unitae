import { Search, X } from 'lucide-react'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { cn } from '~/shared/utils/utils'

interface DocumentSearchProps {
  open: boolean
  value: string
  /** How many names the search lights up; null while there is no search. */
  count: number | null
  onOpenChange: (open: boolean) => void
  onValueChange: (value: string) => void
}

function countLabel(count: number): string {
  if (count === 0) return m.board_viewer_search_count_none()
  return m.board_viewer_search_count({ count })
}

/** Finding a name in any board document: always open from md up, behind a button on a phone. */
export function DocumentSearch({ open, value, count, onOpenChange, onValueChange }: DocumentSearchProps) {
  return (
    <div className="flex items-center gap-2">
      {count != null && (
        <span className={cn('whitespace-nowrap text-muted-foreground text-sm tabular-nums', !open && 'max-md:hidden')}>
          {countLabel(count)}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={() => {
          onOpenChange(!open)
          if (open) onValueChange('')
        }}
        aria-label={m.board_viewer_search_toggle()}
      >
        {open ? <X className="size-4" /> : <Search className="size-4" />}
      </Button>
      <div className={cn('relative hidden md:block', open && '!block')}>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={value}
          onChange={e => onValueChange(e.target.value)}
          placeholder={m.board_viewer_search_placeholder()}
          className="h-8 w-48 pr-9 pl-9 md:w-60 [&::-webkit-search-cancel-button]:hidden"
          aria-label={m.board_viewer_search_toggle()}
        />
        {value.length > 0 && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground"
            onClick={() => onValueChange('')}
          >
            <X className="size-3.5" />
            <span className="sr-only">{m.common_clear()}</span>
          </Button>
        )}
      </div>
    </div>
  )
}
