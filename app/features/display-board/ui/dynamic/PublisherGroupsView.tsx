import { MapPin, Users } from 'lucide-react'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'

interface PublisherGroupsViewData {
  groups: {
    id: number
    name: string
    adress: string
    responsible: {
      id: number
      firstname: string | null
      lastname: string | null
      anonymizedAt: Date | null
    }
    deputy: {
      id: number
      firstname: string | null
      lastname: string | null
      anonymizedAt: Date | null
    } | null
    members: {
      id: number
      firstname: string | null
      lastname: string | null
      type: string
      anonymizedAt: Date | null
    }[]
  }[]
}

function formatName(user: { firstname: string | null; lastname: string | null; anonymizedAt: Date | null }): string {
  if (user.anonymizedAt != null) return m.board_read_status_anonymized_user()
  return [user.firstname, user.lastname].filter(Boolean).join(' ') || '—'
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
    <div className="mx-auto grid w-full max-w-4xl gap-4 p-4 sm:grid-cols-2 md:p-6">
      {groups.map(group => (
        <Card key={group.id}>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display font-semibold text-lg">{group.name}</h2>
                <p className="flex items-center gap-1 text-muted-foreground text-sm">
                  <MapPin className="size-3.5" /> {group.adress}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-1 text-sm">
              <div>
                <span className="text-muted-foreground">{m.board_dynamic_publisher_groups_responsible()} </span>
                <span className="font-medium">{formatName(group.responsible)}</span>
              </div>
              {group.deputy && (
                <div>
                  <span className="text-muted-foreground">{m.board_dynamic_publisher_groups_deputy()} </span>
                  <span className="font-medium">{formatName(group.deputy)}</span>
                </div>
              )}
            </div>
            <hr />
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-sm">
                {m.board_dynamic_publisher_groups_members({
                  count: group.members.length,
                })}
              </span>
              {group.members.length > 0 && (
                <ul className="list-disc pl-5 text-sm">
                  {group.members.map(member => (
                    <li key={member.id}>{formatName(member)}</li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
