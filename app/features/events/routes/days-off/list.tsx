import { CalendarOff, X } from 'lucide-react'
import { Link } from 'react-router'
import { getNextDaysOffs } from '~/features/events/server/days-off.server'
import logger from '~/shared/libs/logger.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/list'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Mes absences - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, session } = await authenticateAndAuthorize(request)
  const events = await getNextDaysOffs(currentUser.id)

  logger.info(`Loading personal Days Off list. User ID: ${currentUser.id}`)

  return {
    user: currentUser,
    events,
    error: session.get('error'),
  }
}

export default function DaysOffPage({ loaderData }: Route.ComponentProps) {
  const { events } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mes absences"
        subtitle="Gérez vos absences. Dès que vous avez prévu de vous absenter, ajoutez une absence pour que les frères en charge des programmes puissent en tenir compte."
        actions={
          <Button asChild>
            <Link to="./new">Nouvelle absence</Link>
          </Button>
        }
      />

      {events.length > 0 ? (
        <div className="flex flex-col gap-3">
          {events.map(event => (
            <Card key={event.id}>
              <CardContent className="flex items-center justify-between py-3">
                <span className="text-sm">
                  du {new Date(event.startDate).toLocaleDateString()} au {new Date(event.endDate).toLocaleDateString()}
                </span>
                <Button variant="ghost" size="icon" asChild className="text-destructive hover:text-destructive">
                  <Link to={`/me/days-off/${event.id}/delete`} title="Supprimer l'absence">
                    <X className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CalendarOff}
          title="Aucune absence prévue."
          description="Dès que vous aurez ajouté une absence, elle apparaîtra ici."
        />
      )}
    </div>
  )
}
