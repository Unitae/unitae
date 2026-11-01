import { Eye, Mail, Pencil } from 'lucide-react'
import { Link } from 'react-router'
import { type ActivityMonths, formatActivityMonth } from '~/features/publishers/model/activity-months'
import { GroupMemberActivityCell } from '~/features/publishers/ui/GroupMemberActivityCell'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { formatPersonName } from '~/shared/utils/format-person-name'

export interface GroupMemberRow {
  id: number
  firstname: string
  lastname: string
  email: string
  currentActivity?: { id: number }
  previousActivity?: { id: number }
}

/**
 * A group's publishers. With `canManageActivity`, two columns link to each one's report for the
 * previous and the current month (`months`), or to a new report pre-filled for that month.
 * Without `canViewPublishers` (an overseer on his own group), names do not link to records he
 * cannot open.
 */
export function GroupMembersTable({
  members,
  months,
  canManageActivity,
  canEditPublishers,
  canViewPublishers,
}: {
  members: GroupMemberRow[]
  months: ActivityMonths
  canManageActivity: boolean
  canEditPublishers: boolean
  canViewPublishers: boolean
}) {
  const locale = getLocale()

  return (
    // Fixed layout: the page stacks two of these (active, then inactive publishers) and their
    // columns line up only if neither sizes them from its own content.
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="text-center max-sm:text-left">{m.publishers_table_firstname()}</TableHead>
          <TableHead className="text-center">{m.publishers_table_lastname()}</TableHead>
          <TableHead className="text-center max-sm:hidden">{m.publishers_table_contact()}</TableHead>
          {canManageActivity && (
            <>
              <TableHead className="text-center">
                {m.groups_view_activity_column({ date: formatActivityMonth(months.previous, locale) })}
              </TableHead>
              <TableHead className="text-center max-sm:hidden">
                {m.groups_view_activity_column({ date: formatActivityMonth(months.current, locale) })}
              </TableHead>
            </>
          )}
          <TableHead className="w-24">
            <span className="sr-only">{m.common_actions()}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map(member => {
          const name = formatPersonName(member)
          const record = `/publishers/${member.id}/view`
          return (
            <TableRow key={member.id}>
              <TableCell className="text-center max-sm:text-left">
                {canViewPublishers ? (
                  <Link className="hover:text-primary" to={record}>
                    {member.firstname}
                  </Link>
                ) : (
                  member.firstname
                )}
              </TableCell>
              <TableCell className="text-center">
                {canViewPublishers ? (
                  <Link className="hover:text-primary" to={record}>
                    {member.lastname?.toLocaleUpperCase()}
                  </Link>
                ) : (
                  member.lastname?.toLocaleUpperCase()
                )}
              </TableCell>
              <TableCell className="text-center max-sm:hidden">
                {member.email && (
                  <Link
                    to={`mailto:${member.email}`}
                    className="hover:text-primary"
                    aria-label={m.groups_member_email_aria({ name })}
                  >
                    <Mail className="inline size-4" />
                  </Link>
                )}
              </TableCell>
              {canManageActivity && (
                <>
                  <GroupMemberActivityCell
                    memberId={member.id}
                    activity={member.previousActivity ?? null}
                    month={months.previous.month}
                    year={months.previous.year}
                  />
                  <GroupMemberActivityCell
                    memberId={member.id}
                    activity={member.currentActivity ?? null}
                    month={months.current.month}
                    year={months.current.year}
                    className="text-center max-sm:hidden"
                  />
                </>
              )}
              <TableCell>
                <div className="flex justify-end gap-1">
                  {canViewPublishers && (
                    <Button asChild variant="ghost" size="icon">
                      <Link to={record} aria-label={m.groups_member_view_aria({ name })}>
                        <Eye className="size-4" />
                      </Link>
                    </Button>
                  )}
                  {canEditPublishers && (
                    <Button asChild variant="ghost" size="icon">
                      <Link to={`/publishers/${member.id}/edit`} aria-label={m.groups_member_edit_aria({ name })}>
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
