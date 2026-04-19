import { AlertTriangle, Clock, Pencil, Trash2, UserPlus, X } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { Role } from '~/shared/types/role'
import { getEventProgramme } from '~/features/events/server/programme-assignments.server'
import { canEditEvent } from '~/features/events/server/programme-auth.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { requireParamId } from '~/shared/utils/params.server'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/view'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.programs_view_meta_title() }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.ProgramViewer,
    Role.ProgramManager,
  ])

  if (!can(Role.ProgramViewer)) throw redirect('/')

  const eventId = requireParamId(params.eventId, '/congregation/programs')

  return withScope(congregationId, async db => {
    const event = await getEventProgramme(db, eventId, congregationId)
    if (!event) throw redirect('/congregation/programs')

    const canEdit = await canEditEvent(db, can, currentUser.id, event.templateId, congregationId)

    logger.info(`Loading event programme. User ID: ${currentUser.id}. Event ID: ${eventId}.`)

    return { event, canEdit }
  })
}

export default function EventViewPage({ loaderData }: Route.ComponentProps) {
  const { event, canEdit } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={event.name}
        subtitle={new Date(event.startDate).toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
        actions={
          canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="./edit">
                  <Pencil className="size-4" />
                  {m.common_edit()}
                </Link>
              </Button>
              <Button variant="destructive" size="sm" asChild>
                <Link to="./delete">
                  <Trash2 className="size-4" />
                  {m.common_delete()}
                </Link>
              </Button>
            </div>
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.programs_view_spiritual_program()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.programs_view_part_col()}</TableHead>
                <TableHead>{m.programs_view_topic_col()}</TableHead>
                <TableHead className="w-24">{m.programs_view_duration_col()}</TableHead>
                <TableHead>{m.programs_view_speaker_col()}</TableHead>
                <TableHead>{m.programs_view_reader_col()}</TableHead>
                {canEdit && <TableHead className="w-20">{m.common_actions()}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {event.partAssignments.map(assignment => (
                <TableRow key={assignment.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">
                        {assignment.name}
                        {assignment.track && (
                          <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 font-medium text-[10px] text-primary uppercase tracking-wide">
                            {assignment.track}
                          </span>
                        )}
                      </span>
                      {assignment.section && (
                        <span className="text-muted-foreground text-xs">{assignment.section}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{assignment.topic || '—'}</TableCell>
                  <TableCell>
                    {assignment.durationMin ? (
                      <span className="flex items-center gap-1 text-muted-foreground text-sm">
                        <Clock className="size-3" />
                        {assignment.durationMin} min
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <AssigneeCell assignee={assignment.assignee} hasConflict={assignment.hasConflict} />
                  </TableCell>
                  <TableCell>
                    {assignment.assistant ? (
                      <span className="text-sm">
                        {assignment.assistant.firstname} {assignment.assistant.lastname}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" asChild className="size-7">
                          <Link
                            to={`./assign-part?assignmentId=${assignment.id}`}
                            title={m.programs_view_assign_title()}
                          >
                            <UserPlus className="size-3" />
                          </Link>
                        </Button>
                        {assignment.assigneeId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            className="size-7 text-destructive hover:text-destructive"
                          >
                            <Link
                              to={`./remove-assignment?type=part&id=${assignment.id}`}
                              title={m.programs_view_remove_assignment_title()}
                            >
                              <X className="size-3" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.programs_view_services()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.programs_view_role_col()}</TableHead>
                <TableHead>{m.programs_view_publisher_col()}</TableHead>
                {canEdit && <TableHead className="w-20">{m.common_actions()}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {event.serviceRoleAssignments.map(assignment => (
                <TableRow key={assignment.id}>
                  <TableCell className="font-medium text-sm">{assignment.name}</TableCell>
                  <TableCell>
                    <AssigneeCell assignee={assignment.assignee} hasConflict={assignment.hasConflict} />
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" asChild className="size-7">
                          <Link
                            to={`./assign-service?assignmentId=${assignment.id}`}
                            title={m.programs_view_assign_title()}
                          >
                            <UserPlus className="size-3" />
                          </Link>
                        </Button>
                        {assignment.assigneeId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            className="size-7 text-destructive hover:text-destructive"
                          >
                            <Link
                              to={`./remove-assignment?type=service&id=${assignment.id}`}
                              title={m.programs_view_remove_assignment_title()}
                            >
                              <X className="size-3" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function AssigneeCell({
  assignee,
  hasConflict,
}: {
  assignee: { firstname: string | null; lastname: string | null } | null
  hasConflict: boolean
}) {
  if (!assignee) {
    return <span className="text-muted-foreground text-sm italic">{m.programs_view_unassigned()}</span>
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">
        {assignee.firstname} {assignee.lastname}
      </span>
      {hasConflict && (
        <Badge variant="destructive" className="gap-1 text-xs">
          <AlertTriangle className="size-3" />
          {m.programs_view_absence_badge()}
        </Badge>
      )}
    </div>
  )
}
