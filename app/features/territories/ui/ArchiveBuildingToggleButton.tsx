import { Archive, ArchiveRestore } from 'lucide-react'
import { Form } from 'react-router'
import type { Building } from '~/database/generated/client'
import { Button } from '~/shared/ui/button'

export default function ArchiveBuildingToggleButton({ building }: { building: Building }) {
  if (building.active === true) {
    return (
      <Form method="post" action={`/territories/building/${building.id}/disable`}>
        <Button type="submit" variant="outline" size="icon" title="Désactiver le batiment">
          <Archive className="size-4" />
        </Button>
      </Form>
    )
  }

  return (
    <Form method="post" action={`/territories/building/${building.id}/enable`}>
      <Button type="submit" variant="secondary" size="icon" title="Activer le batiment">
        <ArchiveRestore className="size-4" />
      </Button>
    </Form>
  )
}
