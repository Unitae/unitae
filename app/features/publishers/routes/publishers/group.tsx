import { Pencil, Siren, UsersRound } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { activityMonths } from '~/features/publishers/model/activity-months'
import { canViewEmergencyInfo } from '~/features/publishers/model/emergency-access'
import { canManageGroupActivity } from '~/features/publishers/model/group-activity-access'
import { getGroup } from '~/features/publishers/server/groups.server'
import { GroupMembersTable } from '~/features/publishers/ui/GroupMembersTable'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Separator } from '~/shared/ui/separator'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { requireParamId } from '~/shared/utils/params.server'
import { zonedNow } from '~/shared/utils/zoned-now'

import type { Route } from './+types/group'

export const meta: Route.MetaFunction = ({ loaderData }) => {
  const group = loaderData?.group
  return [{ title: group ? m.groups_view_meta_title({ name: formatGroupName(group.name) }) : m.groups_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const groupId = requireParamId(params.groupId, '/groups')
  const canViewPublishers = permissions.has(Permission.CanViewPublishers)
  // An overseer or deputy opens the group he leads without the publisher permission.
  const leadsThisGroup =
    currentUser.member?.responsibleFor?.id === groupId || currentUser.member?.deputyFor?.id === groupId
  const canManagePublisher = permissions.has(Permission.CanManagePublisherGroups)
  // The member pencil opens the publisher form, which asks for this one, not the group permission.
  const canEditPublishers = permissions.has(Permission.CanManagePublishers)
  const canManageActivity = permissions.has(Permission.CanRecordActivity)

  if (!canViewPublishers && !leadsThisGroup) {
    throw redirect('/')
  }

  // The two report months, on the congregation's calendar: computed here once, so the data and the
  // column headings and links the page builds from them always agree.
  const months = activityMonths(zonedNow(context.get(congregationContext).timezone))

  return withScopeFromContext(context, async (db, congregationId) => {
    const group = await getGroup(db, groupId, congregationId, months)
    if (group == null) {
      throw redirect(canViewPublishers ? '/groups' : '/')
    }

    const canViewEmergency = canViewEmergencyInfo({
      hasViewer: permissions.has(Permission.CanViewEmergencyInfo),
      hasManager: permissions.has(Permission.CanManageEmergencyInfo),
      myResponsibleGroupId: currentUser.member?.responsibleFor?.id ?? null,
      myDeputyGroupId: currentUser.member?.deputyFor?.id ?? null,
      targetGroupId: group.id,
    })

    return {
      group,
      months,
      roles: {
        canManagePublisher,
        canEditPublishers,
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

// A leader's name links to his publisher record for those who may open it, and reads as text otherwise.
function PersonName({
  person,
  linked,
}: {
  person: { id: number; firstname: string | null; lastname: string | null }
  linked: boolean
}) {
  return linked ? (
    <Link to={`/publishers/${person.id}/view`} className="font-medium text-primary hover:underline">
      {formatPersonName(person)}
    </Link>
  ) : (
    <span className="font-medium text-foreground">{formatPersonName(person)}</span>
  )
}

export default function ViewGroup({ loaderData }: Route.ComponentProps) {
  const { group, months, roles } = loaderData
  // Without the publisher permission (an overseer on his own group), the groups list is out of reach.
  const groupsCrumb = roles.canViewPublishers ? [{ label: m.sidebar_publisher_groups(), to: '/groups' }] : []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={formatGroupName(group.name)}
        subtitle={m.groups_view_subtitle()}
        breadcrumbs={[...groupsCrumb, { label: formatGroupName(group.name) }]}
        backTo={roles.canViewPublishers ? '/groups' : undefined}
        actions={
          <>
            {roles.canManagePublisher && (
              <Button
                asChild
                variant="outline"
                size="icon"
                title={m.groups_view_edit_title()}
                aria-label={m.groups_view_edit_title()}
              >
                <Link to={`/groups/${group.id}/edit`}>
                  <Pencil className="size-4" />
                </Link>
              </Button>
            )}
            {roles.canViewEmergency && (
              <Button
                asChild
                variant="outline"
                size="icon"
                title={m.publishers_emergency_roster_link()}
                aria-label={m.publishers_emergency_roster_link()}
              >
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
            {m.groups_view_responsible()} : <PersonName person={group.responsible} linked={roles.canViewPublishers} />
          </p>
          <p className="text-muted-foreground text-sm">
            {m.groups_view_deputy()} :{' '}
            {group.deputy ? (
              <PersonName person={group.deputy} linked={roles.canViewPublishers} />
            ) : (
              <span className="font-medium text-foreground">{m.groups_view_no_deputy()}</span>
            )}
          </p>
          <p className="text-muted-foreground text-sm">
            {m.groups_view_address()} : <span className="font-medium text-foreground">{group.address}</span>
          </p>
          {/* Whoever can edit the group fixes it himself; the others are pointed to the secretary. */}
          {!roles.canManagePublisher && (
            <>
              <Separator className="my-2" />
              <p className="text-muted-foreground text-xs italic">{m.groups_view_contact_notice()}</p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <h2 className="font-bold font-display text-2xl tracking-tight">{m.groups_view_members_title()}</h2>
        <p className="text-muted-foreground text-sm">{m.groups_view_members_subtitle()}</p>

        {group.members.length === 0 ? (
          <EmptyState icon={UsersRound} title={m.groups_view_members_empty()} />
        ) : (
          <div className="overflow-hidden rounded-2xl border">
            <GroupMembersTable
              members={group.members}
              months={months}
              canManageActivity={roles.canManageActivity}
              canEditPublishers={roles.canEditPublishers}
              canViewPublishers={roles.canViewPublishers}
            />
          </div>
        )}
      </div>
    </div>
  )
}
