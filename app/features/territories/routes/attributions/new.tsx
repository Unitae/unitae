import { Form, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getBoolSetting } from '~/features/settings/server/settings'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { aggregateEntrance } from '~/features/territories/server/buildings'
import { TerritoryCardLink } from '~/features/territories/ui/TerritoryCardLink'
import { db } from '~/shared/libs/db.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Attribution d'un territoire - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const phoneTypeActive = await getBoolSetting(TerritorySettingKey.TerritoryTypePhoneActive)

  const url = new URL(request.url)
  if (!url.searchParams.has('territory')) {
    throw redirect('/territories/attributions/new/available-territories')
  }

  const territory = await db.territory.findUnique({
    where: { id: Number(url.searchParams.get('territory')) },
    include: { entrances: { include: { buildings: true } } },
  })

  if (territory === null) {
    throw redirect('/territories/attributions/new/available-territories')
  }

  const users = await db.user.findMany({
    where: {
      isPublisher: true,
    },
    orderBy: [
      {
        lastname: 'asc',
      },
      { firstname: 'asc' },
    ],
  })

  return { users, phoneTypeActive, territory, territoryEntrances: territory.entrances.map(aggregateEntrance) }
}

export default function CreateAttributionPage({ loaderData }: Route.ComponentProps) {
  const { users, territory, phoneTypeActive, territoryEntrances } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Attribuer un territoire" subtitle="Attribuer manuellement un territoire" />
      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Territoire</Label>
              <input type="hidden" name="territory" value={territory.id} />
              <TerritoryCardLink territory={territory} entrances={territoryEntrances} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Proclamateur</Label>
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                name="publisher"
                required
              >
                <option disabled>Selectionnez un proclamateur</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.lastname?.toLocaleUpperCase()} {user.firstname}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Type de sortie</Label>
              <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" name="type" required>
                <option value={TerritoryAttributionKind.Default}>
                  {phoneTypeActive ? 'Classique' : 'Porte à Porte'}
                </option>
                {!phoneTypeActive && <option value={TerritoryAttributionKind.Phone}>Téléphone</option>}
                <option value={TerritoryAttributionKind.Campaign}>Campagne de distribution</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Date de sortie</Label>
              <Input name="start-date" type="date" defaultValue={new Date().toLocaleDateString('en-CA')} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>
                Notes <span className="text-muted-foreground text-xs">(Ne sera pas visible du proclamateur)</span>
              </Label>
              <textarea
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={4}
                name="notes"
              />
            </div>

            <Button type="submit" className="mt-2">
              Enregistrer l'attribution
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const form = await request.formData()
  const territoryId = Number(form.get('territory'))
  const publisherId = Number(form.get('publisher'))
  const startDateText = String(form.get('start-date'))
  const notes = String(form.get('notes'))
  const type = String(form.get('type'))

  if (Number.isNaN(territoryId) || Number.isNaN(publisherId) || startDateText.length < 1) {
    throw redirect('/territories/territory/new')
  }

  const lateDate = new Date(startDateText)
  lateDate.setMonth(lateDate.getMonth() + 4)

  const attribution = await db.attribution.create({
    data: {
      publisherId: publisherId,
      territoryId: territoryId,
      notes,
      type,
      startDate: new Date(startDateText),
      lateDate: lateDate,
      congregationId: 0 as number,
    },
  })

  return redirect(`/territories/attributions/${attribution.id}/edit`)
}
