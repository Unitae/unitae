import { useState } from 'react'
import type { PublisherGroup } from '~/database/generated/client'

import * as m from '~/i18n/paraglide/messages'
import type { UserInput } from '~/shared/types/user-input'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { formatGroupName } from '~/shared/utils/format-group-name'

const NO_GROUP = '__none__'

// Only the service group. A member's pioneer status is their enrolment, appointed from the
// pioneer section of the edit page — there is no type to pick here.
export default function PublisherFieldServiceForm({ user, groups }: { user?: UserInput; groups: PublisherGroup[] }) {
  const [group, setGroup] = useState(user?.publisherGroupId != null ? String(user.publisherGroupId) : NO_GROUP)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.publishers_form_field_service()}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="space-y-2">
          <Label htmlFor="group">{m.publishers_form_field_service_group()}</Label>
          <input type="hidden" name="group" value={group === NO_GROUP ? '' : group} />
          <Select value={group} onValueChange={setGroup}>
            <SelectTrigger id="group" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_GROUP}>{m.publishers_form_field_service_group_placeholder()}</SelectItem>
              {groups.map(g => (
                <SelectItem key={g.id} value={String(g.id)}>
                  {formatGroupName(g.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}
