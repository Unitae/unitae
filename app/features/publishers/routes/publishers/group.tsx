import { parseWithZod } from '@conform-to/zod'
import { Eye, Mail, Pencil, Siren } from 'lucide-react'
import { data, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { canManageGroupActivity } from '~/features/publishers/model/group-activity-access'
import { updateGroupSchema } from '~/features/publishers/schemas/group.schema'
import { getGroup } from '~/features/publishers/server/groups.server'
import { updateGroup } from '~/features/publishers/server/update-group.server'
import { GroupMemberActivityCell } from '~/features/publishers/ui/GroupMemberActivityCell'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Separator } from '~/shared/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/group'

export const meta: Route.MetaFunction = ({ loaderData }) => {
  return [{ title: loaderData?.group ? `${formatGroupName(loaderData.group.name)} — Unitae` : 'Groupe — Unitae' }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canViewPublishers = permissions.has(Permission.CanViewPublishers)
  const canManagePublisher = permissions.has(Permission.CanManagePublisherGroups)
  const canManageActivity = permissions.has(Permission.CanRecordActivity)

  if (!canViewPublishers) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async (db, congregationId) => {
    const group = await getGroup(db, requireParamId(params.groupId, '/groups'), congregationId)
    if (group == null) {
      throw redirect('/groups/')
    }

    const canViewEmergency =
      permissions.has(Permission.CanViewEmergencyInfo) ||
      permissions.has(Permission.CanManageEmergencyInfo) ||
      currentUser.member?.responsibleFor?.id === group.id ||
      currentUser.member?.deputyFor?.id === group.id

    return {
      group,
      roles: {
        canManagePublisher,
        canViewPublishers,
        canViewEmergency,
        canManageActivity: canManageGroupActivity({
          hasActivityManager: canManageActivity,
          responsibleId: group.responsible.id,
          deputyId: group.deputy?.id ?? null,
          myMemberId: currentUser.member?.id ?? null,
        }),
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
        title={formatGroupName(group.name)}
        subtitle={m.groups_view_subtitle()}
        breadcrumbs={[{ label: m.sidebar_publisher_groups(), to: '/groups' }, { label: formatGroupName(group.name) }]}
        backTo="/groups"
        actions={
          <>
            {roles.canManagePublisher && (
              <Button asChild variant="outline" size="icon" title={m.groups_view_edit_title()}>
                <Link to={'../edit'} relative="path">
                  <Pencil className="size-4" />
                </Link>
              </Button>
            )}
            {roles.canViewEmergency && (
              <Button asChild variant="outline" size="icon" title={m.publishers_emergency_roster_link()}>
                <a href={`/publishers/emergency-roster/${group.id}`}>
                  <Siren className="size-4" />
                </a>
              </Button>
            )}
          </>
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
              {formatPersonName(group.responsible)}
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
                {formatPersonName(group.deputy)}
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
              <TableRow key={member.id}>
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
                  {member.email && (
                    <Link to={`mailto:${member.email}`} className="hover:text-primary">
                      <Mail className="inline size-4" />
                    </Link>
                  )}
                </TableCell>
                {roles.canManageActivity === true && (
                  <>
                    <GroupMemberActivityCell
                      memberId={member.id}
                      activity={member.previousActivity ?? null}
                      month={lastMonth.getMonth()}
                      year={lastMonth.getFullYear()}
                    />
                    <GroupMemberActivityCell
                      memberId={member.id}
                      activity={member.currentActivity ?? null}
                      month={today.getMonth()}
                      year={today.getFullYear()}
                      className="text-center max-sm:hidden"
                    />
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
  const currentUser = context.get(currentAccountContext)
  const previousPage = request.headers.get('referer')
  const canManagePublisher = permissions.has(Permission.CanManagePublisherGroups)

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
    throw redirect(previousPage ?? '/groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  return withScopeFromContext(context, async db => {
    const group = await updateGroup(db, requireParamId(params.groupId, '/groups'), currentUser.congregationId, {
      name,
      address,
      responsibleId,
      deputyId: deputyId ?? null,
    })

    session.flash('success', m.groups_edit_success({ name: formatGroupName(group.name) }))
    return redirect('/groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
