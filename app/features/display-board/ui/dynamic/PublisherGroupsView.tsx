import { Users } from 'lucide-react'
import type { BoardPerson } from '~/features/display-board/model/board-roster'
import type { GroupsLayout } from '~/features/display-board/model/publisher-groups-sheet'
import { PublisherGroupLayout } from '~/features/display-board/ui/dynamic/PublisherGroupLayouts'
import * as m from '~/i18n/paraglide/messages'
import { EmptyState } from '~/shared/ui/EmptyState'
import { cn } from '~/shared/utils/utils'

interface PublisherGroupsViewData {
  groups: {
    id: number
    name: string
    adress: string
    responsible: BoardPerson
    deputy: BoardPerson | null
    members: BoardPerson[]
  }[]
  layout: GroupsLayout
}

export function PublisherGroupsView({ groups, layout }: PublisherGroupsViewData) {
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={m.board_dynamic_publisher_groups_empty_title()}
        description={m.board_dynamic_publisher_groups_empty_description()}
      />
    )
  }

  return (
    // Columns set a group per column, so they get the screen's width; the others read best narrower.
    <div className={cn('mx-auto w-full p-4 md:p-6', layout === 'columns' ? 'max-w-7xl' : 'max-w-4xl')}>
      <PublisherGroupLayout groups={groups} layout={layout} />
    </div>
  )
}
