import { ProgressBar, SectionHeading } from '@unitae/ui'
import { Pencil, Siren, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link, redirect } from 'react-router'
import { formatActivityMonth } from '~/features/publishers/model/activity-months'
import { canViewEmergencyInfo } from '~/features/publishers/model/emergency-access'
import { canCorrectAnyActivity, canManageGroupActivity } from '~/features/publishers/model/group-activity-access'
import { canRecordPastoralVisit } from '~/features/publishers/model/pastoral-visit-access'
import { getGroup } from '~/features/publishers/server/groups.server'
import { type GroupMemberRow, GroupMembersTable } from '~/features/publishers/ui/GroupMembersTable'
import { ReportLegend } from '~/features/publishers/ui/GroupReportCells'
import { useGroupReportEditor } from '~/features/publishers/ui/use-group-report-editor'
import { VisitDialog, type VisitTarget } from '~/features/publishers/ui/VisitDialog'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { useOpenParam } from '~/shared/ui/hooks/use-open-param'
import { PageHeader } from '~/shared/ui/PageHeader'
import { formatDateForInput } from '~/shared/utils/event-time'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { requireParamId } from '~/shared/utils/params.server'

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

  const { timezone } = context.get(congregationContext)

  return withScopeFromContext(context, async (db, congregationId) => {
    const group = await getGroup(db, groupId, congregationId, { timezone })
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

    const leaders = {
      responsibleId: group.responsible.id,
      deputyId: group.deputy?.id ?? null,
      myMemberId: currentUser.member?.id ?? null,
    }
    const canManageGroupReports = canManageGroupActivity({ hasActivityManager: canManageActivity, ...leaders })
    // A filed report opens for correction only for those the edit form lets in.
    const canCorrectReports = canManageGroupActivity({
      hasActivityManager: canCorrectAnyActivity(permissions),
      ...leaders,
    })
    // Every member listed is in this group, so its leaders may record their visits.
    const canRecordVisits = canRecordPastoralVisit({
      hasPublisherViewer: canViewPublishers,
      hasPublisherManager: canEditPublishers,
      myResponsibleGroupId: currentUser.member?.responsibleFor?.id ?? null,
      myDeputyGroupId: currentUser.member?.deputyFor?.id ?? null,
      targetGroupId: group.id,
    })
    // Whether someone preached is a pastoral fact, kept to those who record the group's reports; the
    // missing emergency information, to those who may see emergency information; the last visit, which only
    // the visit dialog shows, to those who may open it.
    const visible = (member: (typeof group.members)[number]) => ({
      ...member,
      reports: canManageGroupReports ? member.reports : [],
      emergencyGaps: canViewEmergency ? member.emergencyGaps : [],
      lastPastoralVisitAt: canRecordVisits ? member.lastPastoralVisitAt : null,
    })

    return {
      group: { ...group, members: group.members.map(visible), inactiveMembers: group.inactiveMembers.map(visible) },
      // The latest a visit can be dated, and the day the visit dialog starts on.
      today: formatDateForInput(new Date(), timezone),
      roles: {
        canManagePublisher,
        canEditPublishers,
        canViewPublishers,
        canViewEmergency,
        canManageActivity: canManageGroupReports,
        canCorrectReports,
        canRecordVisits,
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
    <Link to={`/publishers/${person.id}/view`} className="font-medium text-foreground hover:underline">
      {formatPersonName(person)}
    </Link>
  ) : (
    <span className="font-medium text-foreground">{formatPersonName(person)}</span>
  )
}

export default function ViewGroup({ loaderData }: Route.ComponentProps) {
  const { group, roles } = loaderData
  const reported = group.reportWindow.at(-1)
  const editor = useGroupReportEditor({ members: group.members, inactiveMembers: group.inactiveMembers, reported })
  const [visit, setVisit] = useState<VisitTarget | null>(null)
  // `?visit=<memberId>`, from an old visit link: that member's dialog, for those who may note one.
  useOpenParam('visit', value => {
    const member = [...group.members, ...group.inactiveMembers].find(each => each.id === Number(value))
    if (member && roles.canRecordVisits) {
      setVisit({ publisherId: member.id, name: formatPersonName(member), lastVisit: member.lastPastoralVisitAt })
    }
  })
  const membersTable = (members: GroupMemberRow[]) => (
    <GroupMembersTable
      members={members}
      reportWindow={group.reportWindow}
      canManageActivity={roles.canManageActivity}
      canCorrectReports={roles.canCorrectReports}
      canRecordVisits={roles.canRecordVisits}
      canEditPublishers={roles.canEditPublishers}
      canViewPublishers={roles.canViewPublishers}
      selected={editor.selected}
      onOpenReport={editor.open}
      onOpenEmergency={editor.openEmergency}
      onOpenVisit={member =>
        setVisit({ publisherId: member.id, name: formatPersonName(member), lastVisit: member.lastPastoralVisitAt })
      }
    />
  )
  // Without the publisher permission (an overseer on his own group), the groups list is out of reach.
  const groupsCrumb = roles.canViewPublishers ? [{ label: m.sidebar_publisher_groups(), to: '/groups' }] : []
  const filed = reported
    ? group.members.filter(member => {
        const status = member.reports.at(-1)?.status
        return status === 'filed' || status === 'irregular'
      }).length
    : 0

  return (
    // The marker lets the app shell stop clipping as a scroll container, so the docked panel can stick.
    <div data-sticky-content="" className="flex flex-col gap-6">
      <PageHeader
        title={formatGroupName(group.name)}
        breadcrumbs={[...groupsCrumb, { label: formatGroupName(group.name) }]}
        meta={
          <>
            <span>
              {m.groups_view_responsible()} <PersonName person={group.responsible} linked={roles.canViewPublishers} />
            </span>
            <span>
              {m.groups_view_deputy_short()}{' '}
              {group.deputy ? (
                <PersonName person={group.deputy} linked={roles.canViewPublishers} />
              ) : (
                <span className="font-medium text-foreground">{m.groups_view_no_deputy()}</span>
              )}
            </span>
            {group.address && <span>{group.address}</span>}
            {/* Whoever can edit the group fixes it himself; the others are pointed to the secretary. */}
            {!roles.canManagePublisher && <span className="text-faint">{m.groups_view_contact_notice_short()}</span>}
          </>
        }
        actions={
          <>
            {roles.canViewEmergency && (
              <Button asChild variant="ghost">
                <a href={`/publishers/emergency-roster/${group.id}`}>
                  <Siren />
                  {m.publishers_emergency_roster_link()}
                </a>
              </Button>
            )}
            {roles.canManagePublisher && (
              <Button asChild variant="ghost">
                <Link to={`/groups/${group.id}/edit`}>
                  <Pencil />
                  {m.groups_view_edit_short()}
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[3_1_560px] flex-col gap-3">
          <SectionHeading
            title={m.groups_view_members_title()}
            meta={group.members.length}
            actions={
              reported &&
              roles.canManageActivity &&
              group.members.length > 0 && (
                <span className="flex items-center gap-3 text-muted-foreground text-sm">
                  <span>
                    {m.groups_view_reports_progress({ month: formatActivityMonth(reported, getLocale(), 'long') })}{' '}
                    <b className="font-medium text-foreground tabular-nums">
                      {m.groups_view_reports_count({ filed, total: group.members.length })}
                    </b>
                  </span>
                  <ProgressBar value={filed} max={group.members.length} className="w-28" />
                </span>
              )
            }
          />
          {group.members.length > 0 ? (
            membersTable(group.members)
          ) : (
            <EmptyState
              icon={UsersRound}
              title={
                group.inactiveMembers.length > 0 ? m.groups_view_active_members_empty() : m.groups_view_members_empty()
              }
            />
          )}
          {roles.canManageActivity && <ReportLegend />}

          {/* Left off the board's field service groups document, so listed apart. */}
          {group.inactiveMembers.length > 0 && (
            <>
              <SectionHeading
                title={m.groups_view_inactive_title()}
                meta={group.inactiveMembers.length}
                className="mt-4"
              />
              <p className="-mt-1 text-faint text-sm">{m.groups_view_inactive_subtitle()}</p>
              {membersTable(group.inactiveMembers)}
            </>
          )}
        </div>
        {editor.docked && editor.panel}
      </div>
      {!editor.docked && editor.panel}
      {editor.discard}
      <VisitDialog target={visit} today={loaderData.today} onClose={() => setVisit(null)} />
    </div>
  )
}
