import { BarChart3, Eye, Mail, Pencil, Plus } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { getGroup } from '~/features/publishers/server/groups'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Separator } from '~/shared/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/group'

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.PublisherViewer,
    Role.PublisherManager,
    Role.ActivityManager,
  ])
  const canViewPublishers = can(Role.PublisherViewer)
  const canManagePublisher = can(Role.PublisherManager)
  const canManageActivity = can(Role.ActivityManager)

  if (!canViewPublishers) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const group = await getGroup(db, requireParamId(params.groupId, '/congregation/publisher-groups'))
    if (group == null) {
      throw redirect('/congregation/publisher-groups/')
    }

    return {
      group,
      roles: {
        canManagePublisher,
        canViewPublishers,
        canManageActivity:
          canManageActivity || group.responsible.id === currentUser.id || group.deputy?.id === currentUser.id,
      },
    }
  })
}

export default function ViewGroup({ loaderData }: Route.ComponentProps) {
  const { group, roles } = loaderData

  const today = new Date()
  const lastMonth = new Date()
  lastMonth.setMonth(today.getMonth() - 1)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={group.name.toLocaleUpperCase()}
        subtitle={m.groups_view_subtitle()}
        actions={
          roles.canManagePublisher && (
            <Button asChild variant="outline" size="icon" title={m.groups_view_edit_title()}>
              <Link to={'../edit'} relative="path">
                <Pencil className="size-4" />
              </Link>
            </Button>
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{m.groups_info_title()}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            {m.groups_view_responsible()} :{' '}
            <Link
              to={`../../../publishers/${group.responsible.id}/view`}
              relative="path"
              className="font-medium text-primary hover:underline"
            >
              {group.responsible.firstname} {group.responsible.lastname?.toLocaleUpperCase()}
            </Link>
          </p>
          <p className="text-muted-foreground text-sm">
            {m.groups_view_deputy()} :{' '}
            {group.deputy ? (
              <Link
                to={`../../../publishers/${group.deputy.id}/view`}
                relative="path"
                className="font-medium text-primary hover:underline"
              >
                {group.deputy.firstname} {group.deputy.lastname?.toLocaleUpperCase()}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{m.groups_view_no_deputy()}</span>
            )}
          </p>
          <p className="text-muted-foreground text-sm">
            {m.groups_view_address()} : <span className="font-medium text-foreground">{group.address}</span>
          </p>
          <Separator className="my-2" />
          <p className="text-muted-foreground text-xs italic">{m.groups_view_contact_notice()}</p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <h2 className="font-bold font-display text-2xl tracking-tight">{m.groups_view_members_title()}</h2>
        <p className="text-muted-foreground text-sm">{m.groups_view_members_subtitle()}</p>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center max-sm:text-left">{m.publishers_table_firstname()}</TableHead>
              <TableHead className="text-center">{m.publishers_table_lastname()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.publishers_table_contact()}</TableHead>
              {roles.canManageActivity === true && (
                <>
                  <TableHead className="text-center">
                    {m.groups_view_activity_column({
                      date: lastMonth.toLocaleDateString('fr', { month: 'short', year: 'numeric' }),
                    })}
                  </TableHead>
                  <TableHead className="text-center max-sm:hidden">
                    {m.groups_view_activity_column({
                      date: today.toLocaleDateString('fr', { month: 'short', year: 'numeric' }),
                    })}
                  </TableHead>
                </>
              )}
              {roles.canManagePublisher && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.members.map(member => (
              <TableRow key={member.email}>
                <TableCell className="text-center max-sm:text-left">
                  <Link className="hover:text-primary" to={`../../../publishers/${member.id}/view`} relative="path">
                    {member.firstname}
                  </Link>
                </TableCell>
                <TableCell className="text-center">
                  <Link className="hover:text-primary" to={`../../../publishers/${member.id}/view`} relative="path">
                    {member.lastname?.toLocaleUpperCase()}
                  </Link>
                </TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {member.email.includes('@placeholder.unitae.app') === false && (
                    <Link to={`mailto:${member.email}`} className="hover:text-primary">
                      <Mail className="inline size-4" />
                    </Link>
                  )}
                </TableCell>
                {roles.canManageActivity === true && (
                  <>
                    <TableCell className="text-center">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to={
                            member.previousActivity != null
                              ? `/congregation/publishers/activity/${member.previousActivity?.id}/edit`
                              : `/congregation/publishers/activity/new?publisherId=${member.id}&month=${lastMonth.getMonth()}&year=${lastMonth.getFullYear()}`
                          }
                          title={m.groups_view_activity_edit_title()}
                        >
                          {member.previousActivity ? (
                            <>
                              <BarChart3 className="size-4" /> {m.groups_view_activity_view()}
                            </>
                          ) : (
                            <>
                              <Plus className="size-4" /> {m.groups_view_activity_add()}
                            </>
                          )}
                        </Link>
                      </Button>
                    </TableCell>
                    <TableCell className="text-center max-sm:hidden">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to={
                            member.currentActivity != null
                              ? `/congregation/publishers/activity/${member.currentActivity?.id}/edit`
                              : `/congregation/publishers/activity/new?publisherId=${member.id}&month=${today.getMonth()}&year=${today.getFullYear()}`
                          }
                          title={m.groups_view_activity_edit_title()}
                        >
                          {member.currentActivity ? (
                            <>
                              <BarChart3 className="size-4" /> {m.groups_view_activity_view()}
                            </>
                          ) : (
                            <>
                              <Plus className="size-4" /> {m.groups_view_activity_add()}
                            </>
                          )}
                        </Link>
                      </Button>
                    </TableCell>
                  </>
                )}
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="ghost" size="icon">
                      <Link to={`../../../publishers/${member.id}/view`} relative="path">
                        <Eye className="size-4" />
                      </Link>
                    </Button>
                    {roles.canManagePublisher && (
                      <Button asChild variant="ghost" size="icon">
                        <Link to={`../../../publishers/${member.id}/edit`} relative="path">
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const previousPage = request.headers.get('referer')
  const canManagePublisher = can(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect(previousPage ?? '/')
  }

  const form = await request.formData()
  const name = form.get('name')
  const address = form.get('address')
  const responsibleId = Number(form.get('responsible'))
  const deputyRaw = form.get('deputy')
  const deputyId = deputyRaw ? Number(deputyRaw) : null

  const session = await getSession(request.headers.get('Cookie'))
  if (name == null || address == null || Number.isNaN(responsibleId)) {
    session.flash('error', m.groups_form_error_incomplete())
    throw redirect(previousPage ?? '/congregation/publisher-groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  if (deputyId != null && responsibleId === deputyId) {
    session.flash('error', m.groups_form_error_same_person())
    throw redirect(previousPage ?? '/congregation/publisher-groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  return withScope(congregationId, async db => {
    const membersToConnect = [{ id: responsibleId }]
    if (deputyId != null) membersToConnect.push({ id: deputyId })

    const group = await db.publisherGroup.update({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
        id_congregationId: { id: requireParamId(params.groupId, '/congregation/publisher-groups'), congregationId },
      },
      data: {
        name: String(name),
        adress: String(address),
        deputyId,
        responsibleId,
        members: { connect: membersToConnect },
      },
    })

    session.flash('success', m.groups_edit_success({ name: group.name }))
    return redirect('/congregation/publisher-groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
