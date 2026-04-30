import { useState } from 'react'
import type { PublisherGroup } from '~/database/generated/client'

import * as m from '~/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import type { UserInput } from '~/shared/types/user-input'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'

export default function PublisherFieldServiceForm({
  user,
  groups,
  hideAuxiliaryPioneer = false,
}: {
  user?: UserInput
  groups: PublisherGroup[]
  hideAuxiliaryPioneer: boolean
}) {
  const [type, setType] = useState(user?.type ?? PublisherType.Normal)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.publishers_form_field_service()}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="space-y-2">
          <Label htmlFor="group">{m.publishers_form_field_service_group()}</Label>
          <select
            id="group"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            name="group"
            defaultValue={user?.publisherGroupId ?? ''}
          >
            <option value="">{m.publishers_form_field_service_group_placeholder()}</option>
            {groups.map(group => (
              <option key={group.id} value={group.id}>
                {group.name.toLocaleUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">{m.publishers_form_publisher_profile()}</Label>
          <select
            id="type"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            name="type"
            value={type}
            onChange={e => {
              setType(e.target.value as PublisherType)
            }}
          >
            <option value={PublisherType.Normal}>{m.publishers_form_profile_default()}</option>
            {!hideAuxiliaryPioneer && (
              <option value={PublisherType.PionnierAuxiliaires}>{m.publishers_form_profile_auxiliary_pioneer()}</option>
            )}
            <option value={PublisherType.PionnierPermanant}>{m.publishers_form_profile_permanent_pioneer()}</option>
            <option value={PublisherType.PionnierSpecial}>{m.publishers_form_profile_special_pioneer()}</option>
            <option value={PublisherType.Missionnaire}>{m.publishers_form_profile_missionary()}</option>
          </select>
          {type === PublisherType.PionnierAuxiliaires && (
            <p className="text-muted-foreground text-xs italic">{m.publishers_form_auxiliary_pioneer_warning()}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
