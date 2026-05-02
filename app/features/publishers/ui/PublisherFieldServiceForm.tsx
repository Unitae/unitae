import { useState } from 'react'
import type { PublisherGroup } from '~/database/generated/client'

import * as m from '~/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import type { UserInput } from '~/shared/types/user-input'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

const NO_GROUP = '__none__'

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
                  {g.name.toLocaleUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">{m.publishers_form_publisher_profile()}</Label>
          <Select name="type" value={type} onValueChange={value => setType(value as PublisherType)}>
            <SelectTrigger id="type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PublisherType.Normal}>{m.publishers_form_profile_default()}</SelectItem>
              {!hideAuxiliaryPioneer && (
                <SelectItem value={PublisherType.PionnierAuxiliaires}>
                  {m.publishers_form_profile_auxiliary_pioneer()}
                </SelectItem>
              )}
              <SelectItem value={PublisherType.PionnierPermanant}>
                {m.publishers_form_profile_permanent_pioneer()}
              </SelectItem>
              <SelectItem value={PublisherType.PionnierSpecial}>
                {m.publishers_form_profile_special_pioneer()}
              </SelectItem>
              <SelectItem value={PublisherType.Missionnaire}>{m.publishers_form_profile_missionary()}</SelectItem>
            </SelectContent>
          </Select>
          {type === PublisherType.PionnierAuxiliaires && (
            <p className="text-muted-foreground text-xs italic">{m.publishers_form_auxiliary_pioneer_warning()}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
