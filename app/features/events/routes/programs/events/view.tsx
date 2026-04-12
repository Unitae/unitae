import { AlertTriangle, Clock, Trash2, UserPlus, X } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { getEventProgramme } from '~/features/events/server/programme-assignments.server'
import { isTemplateResponsible } from '~/features/events/server/programme-templates.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/view'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Programme - Unitae' }]
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

    const responsible = event.templateId
      ? await isTemplateResponsible(db, event.templateId, currentUser.id, congregationId)
      : null
    const canEdit = can(Role.ProgramManager) || responsible != null

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
            <Button variant="destructive" size="sm" asChild>
              <Link to="./delete">
                <Trash2 className="size-4" />
                Supprimer
              </Link>
            </Button>
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Programme spirituel</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partie</TableHead>
                <TableHead>Sujet</TableHead>
                <TableHead className="w-24">Durée</TableHead>
                <TableHead>Intervenant</TableHead>
                <TableHead>Assistant</TableHead>
                {canEdit && <TableHead className="w-20">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {event.partAssignments.map(assignment => (
                <TableRow key={assignment.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{assignment.part.name}</span>
                      {assignment.part.section && (
                        <span className="text-muted-foreground text-xs">{assignment.part.section}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{assignment.topic || '—'}</TableCell>
                  <TableCell>
                    {assignment.part.durationMin ? (
                      <span className="flex items-center gap-1 text-muted-foreground text-sm">
                        <Clock className="size-3" />
                        {assignment.part.durationMin} min
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
                            to={`./assign-part?partId=${assignment.partId}&assignmentId=${assignment.id}`}
                            title="Attribuer"
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
                              title="Retirer l'attribution"
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
          <CardTitle className="text-base">Services</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rôle</TableHead>
                <TableHead>Proclamateur</TableHead>
                {canEdit && <TableHead className="w-20">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {event.serviceRoleAssignments.map(assignment => (
                <TableRow key={assignment.id}>
                  <TableCell className="font-medium text-sm">{assignment.serviceRole.name}</TableCell>
                  <TableCell>
                    <AssigneeCell assignee={assignment.assignee} hasConflict={assignment.hasConflict} />
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" asChild className="size-7">
                          <Link
                            to={`./assign-service?serviceRoleId=${assignment.serviceRoleId}&assignmentId=${assignment.id}`}
                            title="Attribuer"
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
                              title="Retirer l'attribution"
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
    return <span className="text-muted-foreground text-sm italic">Non attribué</span>
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">
        {assignee.firstname} {assignee.lastname}
      </span>
      {hasConflict && (
        <Badge variant="destructive" className="gap-1 text-xs">
          <AlertTriangle className="size-3" />
          Absence
        </Badge>
      )}
    </div>
  )
}
