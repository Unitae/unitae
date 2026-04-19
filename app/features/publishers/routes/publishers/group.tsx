import { parseWithZod } from '@conform-to/zod'
import { BarChart3, Eye, Mail, Pencil, Plus } from 'lucide-react'
import { data, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { updateGroupSchema } from '~/features/publishers/schemas/group.schema'
import { getGroup } from '~/features/publishers/server/groups.server'
import { updateGroup } from '~/features/publishers/server/update-group.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Separator } from '~/shared/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/group'

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canViewPublishers = permissions.has(Role.PublisherViewer)
  const canManagePublisher = permissions.has(Role.PublisherManager)
  const canManageActivity = permissions.has(Role.ActivityManager)

  if (!canViewPublishers) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
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

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const previousPage = request.headers.get('referer')
  const canManagePublisher = permissions.has(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect(previousPage ?? '/')
  }

  const submission = parseWithZod(await request.formData(), { schema: updateGroupSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { name, address, responsible: responsibleId, deputy: deputyId } = submission.value

  const session = await getSession(request.headers.get('Cookie'))
  if (deputyId != null && responsibleId === deputyId) {
    session.flash('error', m.groups_form_error_same_person())
    throw redirect(previousPage ?? '/congregation/publisher-groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  return withScopeFromContext(context, async db => {
    const group = await updateGroup(
      db,
      requireParamId(params.groupId, '/congregation/publisher-groups'),
      currentUser.congregationId,
      {
        name,
        address,
        responsibleId,
        deputyId: deputyId ?? null,
      },
    )

    session.flash('success', m.groups_edit_success({ name: group.name }))
    return redirect('/congregation/publisher-groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
