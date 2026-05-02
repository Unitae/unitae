import { Archive, ArchiveRestore } from 'lucide-react'
import { Form } from 'react-router'
import type { Building } from '~/database/generated/client'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

export default function ArchiveBuildingToggleButton({ building }: { building: Building }) {
  if (building.active === true) {
    return (
      <Form method="post" action={`/territories/building/${building.id}/disable`}>
        <Button type="submit" variant="outline" size="icon" title={m.prospection_disable_building_title()}>
          <Archive className="size-4" />
        </Button>
      </Form>
    )
  }

  return (
    <Form method="post" action={`/territories/building/${building.id}/enable`}>
      <Button type="submit" variant="secondary" size="icon" title={m.prospection_enable_building_title()}>
        <ArchiveRestore className="size-4" />
      </Button>
    </Form>
  )
}
