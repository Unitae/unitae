import { Calendar, CalendarOff, ChevronRight } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { getTemplates } from '~/features/events/server/programme-templates.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { Badge } from '~/shared/ui/badge'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Programmes - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.ProgramViewer,
    Role.ProgramManager,
  ])

  if (!can(Role.ProgramViewer)) {
    logger.warn(`Try to load programs. User ID: ${currentUser.id}. Does NOT have rights to access programs.`)
    throw redirect('/')
  }

  logger.info(`Loading program list. User ID: ${currentUser.id}.`)

  return withScope(congregationId, async db => {
    const templates = await getTemplates(db, congregationId)

    const now = new Date()
    const fourWeeksLater = new Date()
    fourWeeksLater.setDate(fourWeeksLater.getDate() + 28)

    const upcomingEvents = await db.event.findMany({
      where: {
        congregationId,
        templateId: { not: null },
        startDate: { gte: now, lte: fourWeeksLater },
      },
      include: { template: true },
      orderBy: { startDate: 'asc' },
      take: 20,
    })

    return {
      templates,
      upcomingEvents,
      roles: { canManagePrograms: can(Role.ProgramManager) },
    }
  })
}

export default function ProgramListPage({ loaderData }: Route.ComponentProps) {
  const { templates, upcomingEvents } = loaderData

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Programmes" subtitle="Modèles de réunions et évènements à venir" />

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-lg">Modèles</h2>
        {templates.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map(template => (
              <Link key={template.id} to={`./templates/${template.id}`} className="no-underline">
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-sm">{template.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {template._count.parts} parties · {template._count.serviceRoles} services
                      </span>
                      {template.responsibles[0] && (
                        <span className="text-muted-foreground text-xs">
                          Responsable : {template.responsibles[0].user.firstname}{' '}
                          {template.responsibles[0].user.lastname}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {template.isRecurring && template.weekDay != null && (
                        <Badge variant="outline" className="text-xs">
                          {dayLabel(template.weekDay)}
                        </Badge>
                      )}
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Calendar}
            title="Aucun modèle de programme"
            description="Les modèles de réunions seront créés automatiquement lors de la configuration."
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Évènements à venir</h2>
          <Link to="./days-off" className="text-muted-foreground text-sm hover:underline">
            Voir les absences
          </Link>
        </div>
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
          <EmptyState
            icon={CalendarOff}
            title="Aucun évènement à venir"
            description="Générez des évènements à partir d'un modèle pour les voir apparaître ici."
          />
        )}
      </section>
    </div>
  )
}

function dayLabel(weekDay: number): string {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
  return days[weekDay] ?? ''
}
