import { useLocation, useSubmit } from 'react-router'
import type { PublisherGroupOption } from '~/features/publishers/ui/PublisherGroupFilter'
import * as m from '~/i18n/paraglide/messages'
import { DropdownMenuItem, DropdownMenuSeparator } from '~/shared/ui/dropdown-menu'
import { formatGroupName } from '~/shared/utils/format-group-name'

/** Posts « Changer de groupe » for these publishers, then comes back to the same filtered list. */
export function useMoveToGroup() {
  const submit = useSubmit()
  const location = useLocation()
  return (memberIds: number[], groupId: number | null) => {
    const form = new FormData()
    for (const id of memberIds) form.append('memberId', String(id))
    form.set('groupId', groupId == null ? 'none' : String(groupId))
    form.set('returnTo', location.search)
    submit(form, { method: 'post', action: '/publishers/move-to-group' })
  }
}

/** The groups to move to, then « Sans groupe », as items of whatever menu holds them. */
export function MoveToGroupItems({
  groups,
  onPick,
}: {
  groups: PublisherGroupOption[]
  onPick: (groupId: number | null) => void
}) {
  return (
    <>
      {groups.map(group => (
        <DropdownMenuItem key={group.id} onSelect={() => onPick(group.id)}>
          {formatGroupName(group.name)}
        </DropdownMenuItem>
      ))}
      {groups.length > 0 && <DropdownMenuSeparator />}
      <DropdownMenuItem onSelect={() => onPick(null)}>{m.publishers_move_no_group()}</DropdownMenuItem>
    </>
  )
}
