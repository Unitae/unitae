import { Users } from 'lucide-react'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { cn } from '~/shared/utils/utils'

interface Person {
  id: number
  firstname: string | null
  lastname: string | null
  anonymizedAt: Date | null
}

interface PublisherGroupsViewData {
  groups: {
    id: number
    name: string
    adress: string
    responsible: Person
    deputy: (Person & { id: number }) | null
    members: (Person & { type: string })[]
  }[]
}

function formatNamePlain(user: Person): string {
  if (user.anonymizedAt != null) return m.board_read_status_anonymized_user()
  const lastname = user.lastname?.toUpperCase() ?? null
  return [user.firstname, lastname].filter(Boolean).join(' ') || '—'
}

function NameDisplay({ person }: { person: Person }) {
  if (person.anonymizedAt != null) {
    return <span className="text-muted-foreground italic">{m.board_read_status_anonymized_user()}</span>
  }
  if (!person.firstname && !person.lastname) {
    return <span>—</span>
  }
  return (
    <span>
      {person.firstname && <span className="text-muted-foreground">{person.firstname} </span>}
      {person.lastname && <span className="font-semibold tracking-wide">{person.lastname.toUpperCase()}</span>}
    </span>
  )
}

function LeaderBlock({ label, person }: { label: string; person: Person }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">{label}</span>
      <span className="text-sm">
        <NameDisplay person={person} />
      </span>
    </div>
  )
}

function buildRoster(group: PublisherGroupsViewData['groups'][number]): Person[] {
  const byId = new Map<number, Person>()
  byId.set(group.responsible.id, group.responsible)
  if (group.deputy) byId.set(group.deputy.id, group.deputy)
  for (const member of group.members) byId.set(member.id, member)
  return [...byId.values()].sort((a, b) => {
    const left = (a.lastname ?? '').localeCompare(b.lastname ?? '', undefined, { sensitivity: 'base' })
    if (left !== 0) return left
    return (a.firstname ?? '').localeCompare(b.firstname ?? '', undefined, { sensitivity: 'base' })
  })
}

export function PublisherGroupsView({ groups }: PublisherGroupsViewData) {
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
    <div className="mx-auto grid w-full max-w-3xl gap-5 p-4 sm:grid-cols-2 md:gap-6 md:p-6">
      {groups.map(group => {
        const roster = buildRoster(group)
        return (
          <Card key={group.id} className="overflow-hidden rounded-2xl border-border/60 shadow-none">
            <CardContent className="flex flex-col gap-5 p-6">
              <header className="flex flex-col gap-1">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(group.adress)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={m.board_dynamic_publisher_groups_address_link_title()}
                  className="self-start text-muted-foreground text-xs uppercase tracking-[0.08em] underline-offset-4 hover:underline"
                >
                  {group.adress}
                </a>
                <h2 className="font-display font-semibold text-xl leading-tight tracking-tight">
                  {formatGroupName(group.name)}
                </h2>
              </header>

              <div className={cn('grid gap-3 text-sm', group.deputy ? 'sm:grid-cols-2' : 'sm:grid-cols-1')}>
                <LeaderBlock label={m.board_dynamic_publisher_groups_responsible_label()} person={group.responsible} />
                {group.deputy && (
                  <LeaderBlock label={m.board_dynamic_publisher_groups_deputy_label()} person={group.deputy} />
                )}
              </div>

              <div className="border-border/60 border-t border-dashed" aria-hidden="true" />

              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">
                  {m.board_dynamic_publisher_groups_members_label()}
                </span>
                <span className="font-medium text-foreground text-sm tabular-nums">{roster.length}</span>
              </div>

              {roster.length > 0 && (
                <ul className="flex flex-col gap-y-1 text-sm tabular-nums">
                  {roster.map(person => (
                    <li key={person.id} className="min-w-0 truncate" title={formatNamePlain(person)}>
                      <NameDisplay person={person} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
