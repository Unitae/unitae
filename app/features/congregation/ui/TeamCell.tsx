import { useEffect, useRef } from 'react'
import { Link, useFetcher } from 'react-router'
import type { MatrixColumn, MatrixMember } from '~/features/congregation/model/role-matrix.type'
import * as m from '~/i18n/paraglide/messages'
import { Checkbox } from '~/shared/ui/checkbox'
import { cn } from '~/shared/utils/utils'

// One person in one team. A tick puts them in or takes them out, saved at once and shown at once; responsables and
// adjoints, and personal roles, are named on the organigram — the cell shows the seat and leads there.

export type TeamToggleResult =
  | { ok: true; intent: 'add' | 'remove'; person: string; role: string }
  | { ok: false; error: string }

interface CellProps {
  member: MatrixMember
  column: MatrixColumn
  canManage: boolean
  /** Said once the change is saved, or refused. */
  onResult: (result: TeamToggleResult) => void
}

const personName = (member: MatrixMember) =>
  `${member.firstname ?? ''} ${member.lastname?.toLocaleUpperCase() ?? ''}`.trim()

const SEAT_MARK: Record<string, string> = { leader: 'R', deputy: 'A', member: '✓' }

function SeatLink({ member, column }: Pick<CellProps, 'member' | 'column'>) {
  const kind = member.seats[column.id]
  const title = column.isSinglePerson
    ? m.teams_personal_title()
    : kind === 'leader'
      ? m.teams_seat_leader_title()
      : m.teams_seat_deputy_title()
  return (
    <Link
      to={`/congregation/roles/organigram?role=${column.id}`}
      title={title}
      aria-label={`${personName(member)} · ${column.name} · ${title}`}
      className={cn(
        'hover:bg-hover focus-visible:ring-ring inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-[11px] font-semibold outline-none focus-visible:ring-2',
        kind ? 'text-brand-text' : 'text-faint',
      )}
    >
      {kind ? (SEAT_MARK[kind] ?? '✓') : '·'}
    </Link>
  )
}

function Toggle({ member, column, canManage, onResult }: CellProps) {
  const fetcher = useFetcher<TeamToggleResult>()
  const reported = useRef(onResult)
  reported.current = onResult

  useEffect(() => {
    if (fetcher.data) reported.current(fetcher.data)
  }, [fetcher.data])

  // Shown as asked while it saves; a refusal puts it back.
  const pending = fetcher.formData?.get('intent')
  const on = pending == null ? member.seats[column.id] === 'member' : pending === 'add'
  const words = { person: personName(member), role: column.name }

  return (
    <Checkbox
      checked={on}
      disabled={!canManage}
      aria-label={on ? m.teams_toggle_remove(words) : m.teams_toggle_add(words)}
      onCheckedChange={next =>
        fetcher.submit(
          { memberId: String(member.id), roleId: String(column.id), intent: next ? 'add' : 'remove' },
          { method: 'post' },
        )
      }
      className="border-border-strong bg-card hover:border-primary size-5 rounded-[5px] border-[1.5px] disabled:opacity-40"
    />
  )
}

export function TeamCell(props: CellProps) {
  const kind = props.member.seats[props.column.id]
  if (props.column.isSinglePerson || kind === 'leader' || kind === 'deputy') return <SeatLink {...props} />
  return <Toggle {...props} />
}
