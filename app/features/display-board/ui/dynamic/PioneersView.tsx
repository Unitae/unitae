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

function formatName(user: { firstname: string | null; lastname: string | null; anonymizedAt: Date | null }): string {
  if (user.anonymizedAt != null) return m.board_read_status_anonymized_user()
  return [user.firstname, user.lastname].filter(Boolean).join(' ') || '—'
}

function labelForType(type: string): string {
  if (type === 'PionnierPermanant') return m.board_dynamic_pioneers_type_permanent()
  if (type === 'PionnierSpecial') return m.board_dynamic_pioneers_type_special()
  if (type === 'Missionnaire') return m.board_dynamic_pioneers_type_missionary()
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      {Object.entries(byType).map(([type, members]) => (
        <Card key={type}>
          <CardContent className="flex flex-col gap-3">
            <h2 className="font-display font-semibold text-lg">
              {labelForType(type)} ({members.length})
            </h2>
            <ul className="grid list-disc gap-1 pl-5 text-sm sm:grid-cols-2">
              {members.map(pioneer => (
                <li key={pioneer.id}>{formatName(pioneer)}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
