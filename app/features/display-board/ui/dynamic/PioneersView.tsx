import { Star } from 'lucide-react'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'

interface Pioneer {
  id: number
  firstname: string | null
  lastname: string | null
  type: string
  anonymizedAt: Date | null
}

interface PioneersViewData {
  pioneers: Pioneer[]
}

function NameDisplay({ person }: { person: Pioneer }) {
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

function labelForType(type: string): string {
  if (type === 'PionnierPermanant') return m.board_dynamic_pioneers_type_permanent()
  if (type === 'PionnierSpecial') return m.board_dynamic_pioneers_type_special()
  if (type === 'Missionnaire') return m.board_dynamic_pioneers_type_missionary()
  if (type === 'PionnierAuxiliaires') return m.board_dynamic_pioneers_type_auxiliary()
  return type
}

export function PioneersView({ pioneers }: PioneersViewData) {
  if (pioneers.length === 0) {
    return (
      <EmptyState
        icon={Star}
        title={m.board_dynamic_pioneers_empty_title()}
        description={m.board_dynamic_pioneers_empty_description()}
      />
    )
  }

  const byType = pioneers.reduce<Record<string, Pioneer[]>>((acc, pioneer) => {
    if (!acc[pioneer.type]) acc[pioneer.type] = []
    acc[pioneer.type].push(pioneer)
    return acc
  }, {})

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 md:gap-6 md:p-6">
      {Object.entries(byType).map(([type, members]) => (
        <Card key={type} className="overflow-hidden rounded-2xl border-border/60 shadow-none">
          <CardContent className="flex flex-col gap-5 p-6">
            <h2 className="font-display font-semibold text-xl leading-tight tracking-tight">
              {labelForType(type)}
              <span className="font-normal text-muted-foreground text-sm tabular-nums"> · {members.length}</span>
            </h2>
            <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm tabular-nums sm:grid-cols-2">
              {members.map(pioneer => (
                <li key={pioneer.id} className="min-w-0 truncate">
                  <NameDisplay person={pioneer} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
