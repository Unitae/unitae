import { ExternalLink, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Form, Link, redirect } from 'react-router'
import * as m from '~/paraglide/messages'
import { Role } from '~/features/authorization/model/roles.type'
import { getBoolSetting } from '~/features/settings/server/settings'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { aggregateEntrance } from '~/features/territories/server/buildings'
import BuildingEntranceMap from '~/features/territories/ui/BuildingEntranceMap'
import BuildingSelector from '~/features/territories/ui/BuildingSelector'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { getOptionalEnv } from '~/shared/libs/env.server'
import { LimitService } from '~/shared/libs/limits.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.territories_new_meta_title() }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY')

  return withScope(congregationId, async db => {
    const phoneTypeActive = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)
    const url = new URL(request.url)
    const zips = await db.building.groupBy({
      by: ['zip'],
      where: { active: true, congregationId },
    })

    const buildings = await db.building.findMany({
      where: {
        active: true,
        congregationId,
        street: String(url.searchParams.get('street')),
        zip: String(url.searchParams.get('zip')),
      },
      select: { entrances: { include: { buildings: true } } },
    })
    const entrances = buildings.flatMap(building => building.entrances).map(aggregateEntrance)
    if (!url.searchParams.has('zip')) {
      return { zips, buildings: [], streets: [], phoneTypeActive, entrances }
    }

    const streets = await db.building.groupBy({
      by: ['street'],
      where: { active: true, congregationId, zip: String(url.searchParams.get('zip')) },
    })

    if (!url.searchParams.has('street')) {
      return { zips, buildings: [], streets, phoneTypeActive, entrances }
    }

    return { entrances, zips, streets, phoneTypeActive, apiKey }
  })
}

export default function NewTerritoryPage({ loaderData }: Route.ComponentProps) {
  const { entrances, zips, streets, phoneTypeActive, apiKey } = loaderData
  const [territoryEntrances, setTerritoryEntrances] = useState<typeof entrances>([])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.territories_new_title()} subtitle={m.territories_new_subtitle()} />
      <div className="flex gap-10 max-sm:flex-col">
        <Card className="flex-1">
          <CardContent className="pt-6">
            <Form method="post" className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>{m.territories_form_number()}</Label>
                <Input name="number" type="text" placeholder={m.territories_form_number_placeholder()} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{m.territories_form_type()}</Label>
                <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" name="type" required>
                  <option value={TerritoryKind.Classical}>{m.territories_type_classical_capitalized()}</option>
                  <option value={TerritoryKind.Commerces}>{m.territories_type_commerces()}</option>
                  <option value={TerritoryKind.Hotel}>{m.territories_type_hotel()}</option>
                  {phoneTypeActive && <option value={TerritoryKind.Phone}>{m.territories_type_phone_singular()}</option>}
                  <option value={TerritoryKind.Univ}>{m.territories_type_university_singular()}</option>
                </select>
              </div>
              <h2 className="font-semibold text-lg">{m.territories_form_entrances_heading()}</h2>
              {territoryEntrances.map(entrance => (
                <div key={entrance.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <input type="hidden" name="entrances" value={entrance.id} />
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {entrance.buildings.map(building => building.number).join(', ')} {entrance.buildings[0].street},{' '}
                      {entrance.buildings[0].zip}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {m.territories_form_homes_count({ count: (entrance.homes ?? 0) || (entrance.phones ?? 0) })}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" asChild>
                      <Link
                        to={`/territories/building/${entrance.buildings[0].id}/edit`}
                        title={m.territories_form_view_building_title()}
                      >
                        <ExternalLink className="size-4 text-primary" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        const tmpBuilding = territoryEntrances.filter(tb => tb.id !== entrance.id)
                        setTerritoryEntrances(tmpBuilding)
                      }}
                      title={m.territories_form_remove_building_title()}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <BuildingSelector
                zips={zips}
                streets={streets}
                entrances={entrances ?? []}
                selection={territoryEntrances}
                onSelectionChange={selection => setTerritoryEntrances(selection)}
              />
              <Button type="submit" className="mt-2">
                {m.territories_form_create_submit()}
              </Button>
            </Form>
          </CardContent>
        </Card>

        <BuildingEntranceMap entrances={territoryEntrances} apiKey={apiKey} />
      </div>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { congregation, can, congregationId } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const form = await request.formData()
  const number = form.get('number')
  const type = form.get('type')
  const entrances = form.getAll('entrances')

  if (!number) {
    throw redirect('/territories/territory/new')
  }

  return withScope(congregationId, async db => {
    const limits = new LimitService(db, congregation)
    await limits.errorIfWouldGoOverLimit('territories')

    await db.territory.create({
      data: {
        number: String(number),
        type: String(type),
        entrances: {
          connect: entrances.map(el => ({ id: Number(el) })),
        },
        congregationId: congregation.id,
      },
    })

    return redirect('/territories')
  })
}
