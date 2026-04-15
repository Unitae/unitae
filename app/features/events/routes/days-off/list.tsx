import { CalendarOff, X } from 'lucide-react'
import { Link } from 'react-router'
import { getNextDaysOffs } from '~/features/events/server/days-off.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.days_off_meta_title() }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, session, congregationId } = await authenticateAndAuthorize(request)

  return withScope(congregationId, async db => {
    const events = await getNextDaysOffs(db, currentUser.id, congregationId)

    logger.info(`Loading personal Days Off list. User ID: ${currentUser.id}`)

    return {
      user: currentUser,
      events,
      error: session.get('error'),
    }
  })
}

export default function DaysOffPage({ loaderData }: Route.ComponentProps) {
  const { events } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.days_off_page_title()}
        subtitle={m.days_off_page_subtitle()}
        actions={
          <Button asChild>
            <Link to="./new">{m.days_off_new_button()}</Link>
          </Button>
        }
      />

      {events.length > 0 ? (
        <div className="flex flex-col gap-3">
          {events.map(event => (
            <Card key={event.id}>
              <CardContent className="flex items-center justify-between py-3">
                <span className="text-sm">
                  {m.days_off_date_range({
                    startDate: new Date(event.startDate).toLocaleDateString(),
                    endDate: new Date(event.endDate).toLocaleDateString(),
                  })}
                </span>
                <Button variant="ghost" size="icon" asChild className="text-destructive hover:text-destructive">
                  <Link to={`/me/days-off/${event.id}/delete`} title={m.days_off_delete_title()}>
                    <X className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={CalendarOff} title={m.days_off_empty_title()} description={m.days_off_empty_description()} />
      )}
    </div>
  )
}
