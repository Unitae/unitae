import { Calendar, CalendarOff, ChevronRight, FileDown } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { Role } from '~/shared/types/role'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.programs_meta_title() }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)

  if (!permissions.has(Role.ProgramViewer)) {
    logger.warn(`Try to load programs. User ID: ${currentUser.id}. Does NOT have rights to access programs.`)
    throw redirect('/')
  }

  logger.info(`Loading program list. User ID: ${currentUser.id}.`)

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    // Inclure tous les évènements à partir du début du mois en cours —
    // permet de voir les évènements planifiés plusieurs mois à l'avance.
    const now = new Date()
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const upcomingEvents = await db.event.findMany({
      where: {
        congregationId,
        startDate: { gte: startOfCurrentMonth },
        // biome-ignore lint/style/useNamingConvention: prisma syntax
        NOT: { kind: { key: 'off' } },
      },
      include: { template: true },
      orderBy: { startDate: 'asc' },
    })

    return {
      upcomingEvents,
      roles: { canManagePrograms: permissions.has(Role.ProgramManager) },
    }
  })
}

export default function ProgramListPage({ loaderData }: Route.ComponentProps) {
  const { upcomingEvents, roles } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.programs_page_title()}
        subtitle={m.programs_page_subtitle()}
        actions={
          <div className="flex gap-2">
            {roles.canManagePrograms && (
              <Button asChild>
                <Link to="./new">{m.programs_new_event_button()}</Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link to="./export-pdf">
                <FileDown className="size-4" />
                {m.programs_export_pdf_button()}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="./days-off">{m.programs_days_off_button()}</Link>
            </Button>
          </div>
        }
      />

      {upcomingEvents.length > 0 ? (
        <div className="flex flex-col gap-2">
          {upcomingEvents.map(event => (
            <Link key={event.id} to={`./events/${event.id}`} className="no-underline">
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="size-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{event.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(event.startDate).toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={CalendarOff} title={m.programs_empty_title()} description={m.programs_empty_description()} />
      )}
    </div>
  )
}
