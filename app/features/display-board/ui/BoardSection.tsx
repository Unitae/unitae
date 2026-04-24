import { ChevronRight } from 'lucide-react'
import * as m from '~/paraglide/messages'
import { Badge } from '~/shared/ui/badge'
import { cn } from '~/shared/utils/utils'

import { DocumentCard, type DocumentCardItem } from './DocumentCard'

interface BoardSectionProps {
  name: string
  items: DocumentCardItem[]
  isCollapsed: boolean
  onToggleCollapse: () => void
  canManageBoard: boolean
}

export function BoardSection({ name, items, isCollapsed, onToggleCollapse, canManageBoard }: BoardSectionProps) {
  const unreadCount = items.filter(item => !item.alreadyViewed).length

  return (
    <section>
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex w-full cursor-pointer items-center gap-2 text-left"
      >
        <ChevronRight
          className={cn('size-5 text-muted-foreground transition-transform duration-200', !isCollapsed && 'rotate-90')}
        />
        <h2 className="font-bold font-display text-xl tracking-tight">{name}</h2>
        <Badge variant="outline" className="text-xs">
          {items.length}
        </Badge>
        {unreadCount > 0 && (
          <Badge variant="info" className="text-xs">
            {m.board_section_new_count({ count: unreadCount })}
          </Badge>
        )}
      </button>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-in-out',
          isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
        )}
      >
        <div className="overflow-hidden">
          {items.length > 0 ? (
            <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3 max-sm:grid-cols-1">
              {items.map(file => (
                <DocumentCard key={`${file.kind}-${file.id}`} file={file} alreadyViewed={file.alreadyViewed} />
              ))}
            </div>
          ) : canManageBoard ? (
            <p className="mt-3 text-muted-foreground text-sm">{m.board_section_empty()}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
