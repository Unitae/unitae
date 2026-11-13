import { Avatar } from '@unitae/ui'
import { useState } from 'react'
import type { MatrixGroup, MatrixMember } from '~/features/congregation/model/role-matrix.type'
import { TeamCell, type TeamToggleResult } from '~/features/congregation/ui/TeamCell'
import { bandLabel, personName } from '~/features/congregation/ui/TeamsTable'
import * as m from '~/i18n/paraglide/messages'
import { Label } from '~/shared/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '~/shared/ui/select'

// On a phone, one team at a time: the team on top, everyone below with their tick. A grid of columns does not fit a
// phone's width, and one team is what a person arranges at once.

export function TeamsPhone({
  groups,
  members,
  counts,
  canManage,
  onResult,
}: {
  groups: MatrixGroup[]
  members: MatrixMember[]
  counts: Record<number, number>
  canManage: boolean
  onResult: (result: TeamToggleResult) => void
}) {
  const columns = groups.flatMap(group => group.columns)
  const [teamId, setTeamId] = useState(columns[0]?.id ?? null)
  const column = columns.find(each => each.id === teamId) ?? columns[0]
  if (!column) return null
  const count = counts[column.id] ?? 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="teams-team">{m.teams_team()}</Label>
        <Select value={String(column.id)} onValueChange={value => setTeamId(Number(value))}>
          <SelectTrigger id="teams-team" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groups.map(group => (
              <SelectGroup key={group.key}>
                <SelectLabel>{bandLabel(group)}</SelectLabel>
                {group.columns.map(each => (
                  <SelectItem key={each.id} value={String(each.id)}>
                    {each.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <p className="text-faint text-xs">{m.teams_members({ count: count })}</p>
      </div>
      {members.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">{m.teams_none_match()}</p>
      ) : (
        <ul className="divide-border border-border bg-card flex flex-col divide-y rounded-lg border">
          {members.map(member => (
            <li key={member.id} className="flex min-h-12 items-center gap-3 px-3.5">
              <Avatar name={personName(member)} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm">{personName(member)}</span>
              <TeamCell member={member} column={column} canManage={canManage} onResult={onResult} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
