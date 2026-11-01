import { Form } from 'react-router'
import {
  type GroupLeaderCandidate,
  groupLeaderAvailability,
} from '~/features/publishers/model/group-leader-availability'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'
import { PersonDropdown, type PersonOption } from '~/shared/ui/PersonDropdown'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { formatPersonName } from '~/shared/utils/format-person-name'

/**
 * Who is in the group, on its edit page: add a publisher (they leave the group they were in) or
 * remove one. The overseer and deputy stay in the group they lead, so they have no remove button,
 * and the leaders of other groups are held back from the publishers on offer.
 */
export function GroupMembersCard({
  groupId,
  responsibleId,
  deputyId,
  members,
  candidates,
}: {
  groupId: number
  responsibleId: number
  deputyId: number | null
  members: PersonOption[]
  candidates: (PersonOption & GroupLeaderCandidate)[]
}) {
  const { disabledIds, disabledReason } = groupLeaderAvailability(candidates, groupId)
  const leaderRole = (memberId: number) => {
    if (memberId === responsibleId) return m.groups_form_responsible()
    if (memberId === deputyId) return m.groups_form_deputy()
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.groups_view_members_title()}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">{m.groups_members_description()}</p>

        <Form method="post" action={`/groups/${groupId}/members/add`} className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-60 flex-1 flex-col gap-2">
            <Label htmlFor="group-member-add">{m.groups_members_add_label()}</Label>
            <PersonDropdown
              id="group-member-add"
              name="memberId"
              people={candidates}
              placeholder={m.groups_members_add_placeholder()}
              allowNone={false}
              disabledIds={disabledIds}
              disabledReason={disabledReason}
            />
          </div>
          <SubmitButton variant="outline">{m.groups_members_add_submit()}</SubmitButton>
        </Form>

        {members.length === 0 ? (
          <p className="text-muted-foreground text-sm">{m.groups_view_members_empty()}</p>
        ) : (
          <ul className="divide-y rounded-2xl border">
            {members.map(member => {
              const name = formatPersonName(member)
              const role = leaderRole(member.id)
              return (
                <li key={member.id} className="flex min-h-12 items-center justify-between gap-3 px-4 py-1.5">
                  <span className="flex items-center gap-2 text-sm">
                    {name}
                    {role && <Badge variant="secondary">{role}</Badge>}
                  </span>
                  {role == null && (
                    <Form method="post" action={`/groups/${groupId}/members/${member.id}/remove`}>
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        aria-label={m.groups_members_remove_aria({ name })}
                      >
                        {m.groups_members_remove()}
                      </Button>
                    </Form>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
