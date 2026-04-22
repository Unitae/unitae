import { AlertTriangle, CalendarOff, FileText, Info, MapPin, Mic } from 'lucide-react'
import { Link } from 'react-router'

import {
  getRecentDocuments,
  getUpcomingAbsences,
  getUpcomingAssignments,
  getUserTerritories,
  type TerritoryStatus,
} from '~/features/dashboard/server/dashboard.server'
import * as m from '~/paraglide/messages'
import { userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { RelativeTime } from '~/shared/ui/RelativeTime'

import type { Route } from './+types/index'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Accueil - Unitae' }]
}

async function safeQuery<T>(label: string, userId: number, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (error) {
    logger.error(`Dashboard widget "${label}" failed for user ${userId}`, error)
    return null
  }
}

export function loader({ context }: Route.LoaderArgs) {
  const currentUser = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const [territories, recentDocuments, absences, assignments] = await Promise.all([
      safeQuery('territories', currentUser.id, () => getUserTerritories(db, currentUser.id)),
      safeQuery('documents', currentUser.id, () => getRecentDocuments(db, currentUser.id, currentUser.congregationId)),
      safeQuery('absences', currentUser.id, () => getUpcomingAbsences(db, currentUser.id, currentUser.congregationId)),
      safeQuery('assignments', currentUser.id, () => getUpcomingAssignments(db, currentUser.id)),
    ])

    return {
      currentUser: { firstname: currentUser.firstname },
      territories,
      recentDocuments,
      absences,
      assignments,
    }
  })
}

const statusVariant: Record<TerritoryStatus, 'success' | 'warning' | 'destructive'> = {
  'on-time': 'success',
  'due-soon': 'warning',
  overdue: 'destructive',
}

function statusLabel(status: TerritoryStatus): string {
  if (status === 'on-time') return m.dashboard_territory_on_time()
  if (status === 'due-soon') return m.dashboard_territory_due_soon()
  return m.dashboard_territory_overdue()
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { currentUser, territories, recentDocuments, absences, assignments } = loaderData

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in-up">
        <h1 className="font-display font-semibold text-2xl tracking-tight">
          {m.dashboard_greeting({ name: currentUser.firstname ?? '' })}
        </h1>
        <p className="text-muted-foreground text-sm">{today}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="animate-fade-in-up" style={{ animationDelay: '50ms' }}>
          <TerritoriesCard territories={territories} />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <AssignmentsCard assignments={assignments} />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: '150ms' }}>
          <DocumentsCard documents={recentDocuments} />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <AbsencesCard absences={absences?.upcoming ?? null} shouldNudge={absences?.shouldNudge ?? false} />
        </div>
      </div>
    </div>
  )
}

function WidgetError() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
      <AlertTriangle className="size-4 shrink-0" />
      <span className="text-sm">{m.dashboard_widget_error()}</span>
    </div>
  )
}

function TerritoriesCard({ territories }: { territories: Awaited<ReturnType<typeof getUserTerritories>> | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.dashboard_my_territories()}</CardTitle>
      </CardHeader>
      <CardContent>
        {territories == null ? (
          <WidgetError />
        ) : territories.length === 0 ? (
          <EmptyState icon={MapPin} title={m.dashboard_no_territories()} />
        ) : (
          <div className="flex flex-col gap-2">
            {territories.map(t => (
              <Link
                key={t.id}
                to={`/me/territories/${t.territory.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{t.territory.number}</span>
                  <span className="text-muted-foreground text-xs">
                    <RelativeTime date={t.lateDate} />
                  </span>
                </div>
                <Badge variant={statusVariant[t.status]}>{statusLabel(t.status)}</Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button variant="link" asChild className="px-0">
          <Link to="/me/territories">{m.dashboard_view_all()}</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

function AssignmentsCard({ assignments }: { assignments: Awaited<ReturnType<typeof getUpcomingAssignments>> | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.dashboard_my_assignments()}</CardTitle>
      </CardHeader>
      <CardContent>
        {assignments == null ? (
          <WidgetError />
        ) : assignments.length === 0 ? (
          <EmptyState icon={Mic} title={m.dashboard_no_assignments()} />
        ) : (
          <div className="flex flex-col gap-2">
            {assignments.map(a => (
              <Link
                key={`${a.kind}-${a.id}`}
                to={`/programs/events/${a.eventId}`}
                className="flex flex-col gap-0.5 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{a.name}</span>
                  <span className="shrink-0 text-muted-foreground text-xs">
                    <RelativeTime date={a.eventDate} />
                  </span>
                </div>
                {a.topic && <span className="text-muted-foreground text-xs">{a.topic}</span>}
                <span className="text-muted-foreground text-xs">{a.eventName}</span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DocumentsCard({ documents }: { documents: Awaited<ReturnType<typeof getRecentDocuments>> | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.dashboard_recent_documents()}</CardTitle>
      </CardHeader>
      <CardContent>
        {documents == null ? (
          <WidgetError />
        ) : documents.length === 0 ? (
          <EmptyState icon={FileText} title={m.dashboard_no_documents()} />
        ) : (
          <div className="flex flex-col gap-2">
            {documents.map(doc => (
              <Link
                key={`${doc.kind}-${doc.id}`}
                to={doc.kind === 'pdf' ? `/board/documents/${doc.id}/viewer` : `/board/dynamic/${doc.id}/viewer`}
                className="flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50"
              >
                {!doc.alreadyViewed && <span className="size-2.5 shrink-0 rounded-full bg-primary" />}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-sm">{doc.title}</span>
                  <span className="text-muted-foreground text-xs">
                    <RelativeTime date={doc.createdAt} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button variant="link" asChild className="px-0">
          <Link to="/board">{m.dashboard_view_all()}</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

function AbsencesCard({
  absences,
  shouldNudge,
}: {
  absences: Awaited<ReturnType<typeof getUpcomingAbsences>>['upcoming'] | null
  shouldNudge: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.dashboard_my_absences()}</CardTitle>
      </CardHeader>
      <CardContent>
        {absences == null ? (
          <WidgetError />
        ) : (
          <>
            {shouldNudge && (
              <Alert className="mb-3 border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400">
                <Info className="size-4" />
                <AlertDescription>{m.dashboard_absence_nudge()}</AlertDescription>
              </Alert>
            )}
            {absences.length === 0
              ? !shouldNudge && <EmptyState icon={CalendarOff} title={m.dashboard_no_absences()} />
              : absences.map(a => (
                  <div key={a.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                    <CalendarOff className="size-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm">
                      {formatDate(a.startDate)} — {formatDate(a.endDate)}
                    </span>
                  </div>
                ))}
          </>
        )}
      </CardContent>
      <CardFooter>
        <Button variant="link" asChild className="px-0">
          <Link to="/me/days-off">{m.dashboard_view_all()}</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
