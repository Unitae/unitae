import { Archive, ArchiveRestore } from 'lucide-react'
import { Form } from 'react-router'
import type { Building } from '~/database/generated/client'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

/** Disables or re-enables the building. `labelled` spells the action out instead of an icon alone. */
export default function ArchiveBuildingToggleButton({
  building,
  labelled = false,
}: {
  building: Building
  labelled?: boolean
}) {
  const active = building.active === true
  const label = active ? m.building_disable_button() : m.building_enable_button()
  const Icon = active ? Archive : ArchiveRestore

  return (
    <Form method="post" action={`/territories/building/${building.id}/${active ? 'disable' : 'enable'}`}>
      {labelled ? (
        <Button type="submit" variant="ghost">
          {label}
        </Button>
      ) : (
        <Button
          type="submit"
          variant={active ? 'outline' : 'secondary'}
          size="icon"
          title={active ? m.prospection_disable_building_title() : m.prospection_enable_building_title()}
        >
          <Icon className="size-4" />
        </Button>
      )}
    </Form>
  )
}
