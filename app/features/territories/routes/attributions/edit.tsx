import { ArrowDownToLine, X } from 'lucide-react'
import { useState } from 'react'
import { Form, redirect } from 'react-router'
import type { Prisma } from '~/database/generated/client'
import { Role } from '~/features/authorization/model/roles.type'
import { getPublishers } from '~/features/publishers/server/publishers'
import { getBoolSetting } from '~/features/settings/server/settings'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { aggregateEntrance } from '~/features/territories/server/buildings'
import { TerritoryCardLink } from '~/features/territories/ui/TerritoryCardLink'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { requireParamId } from '~/shared/libs/params.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Modification d'une attribution de territoire - Unitae` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { can, db } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const phoneTypeActive = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive)

  const attribution = await db.attribution.findUnique({
    where: { id: requireParamId(params.attributionId, '/territories/attributions') },
    include: { territory: { include: { entrances: { include: { buildings: true } } } }, publisher: true },
  })

  if (attribution == null) {
    throw redirect('/territories/attributions')
  }

  const users = await getPublishers(db)

  return { users, phoneTypeActive, attribution, entrances: attribution.territory.entrances.map(aggregateEntrance) }
}

export default function EditAttributionPage({ loaderData }: Route.ComponentProps) {
  const { users, attribution, phoneTypeActive, entrances } = loaderData
  const [shouldShowEndDate, showEndDate] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Modifier une attribution"
        subtitle="Mettre à jour l'attribution d'un proclamateur"
        actions={
          attribution.endDate === null && (
            <>
              <Button
                variant={shouldShowEndDate ? 'default' : 'outline'}
                size="icon"
                title="Rentrer le territoire"
                type="button"
                onClick={() => showEndDate(state => !state)}
              >
                <ArrowDownToLine className="size-4" />
              </Button>
              <Button variant="destructive" size="sm" asChild>
                <a href={`./${attribution.id}/delete`} title="Annuler l'attribution">
                  <X className="size-4" />
                </a>
              </Button>
            </>
          )
        }
      />
      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Territoire</Label>
              <input type="hidden" name="territory" value={attribution.territory.id} />
              <TerritoryCardLink territory={attribution.territory} entrances={entrances} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Proclamateur</Label>
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                name="publisher"
                required
                defaultValue={String(attribution.publisherId)}
                disabled={attribution.endDate !== null}
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
              <Label>Type d'attribution</Label>
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                name="type"
                required
                defaultValue={attribution.type}
                disabled={attribution.endDate !== null}
              >
                <option value={TerritoryAttributionKind.Default}>
                  {phoneTypeActive ? 'Classique' : 'Porte à Porte'}
                </option>
                {!phoneTypeActive && <option value={TerritoryAttributionKind.Phone}>Téléphone</option>}
                <option value={TerritoryAttributionKind.Campaign}>Campagne de distribution</option>
              </select>
            </div>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>Date de sortie</Label>
                <Input
                  name="start-date"
                  type="date"
                  defaultValue={attribution.startDate.toLocaleDateString('en-CA')}
                  readOnly
                />
              </div>
              {attribution.endDate || shouldShowEndDate ? (
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label className={attribution.endDate ? '' : 'text-destructive'}>Date de rentrée</Label>
                  <Input
                    className={attribution.endDate ? '' : 'border-destructive'}
                    name="end-date"
                    type="date"
                    defaultValue={
                      attribution.endDate?.toLocaleDateString('en-CA') ?? new Date().toLocaleDateString('en-CA')
                    }
                    max={new Date().toLocaleDateString('en-CA')}
                    readOnly={attribution.endDate !== null}
                  />
                </div>
              ) : (
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label>À rentrer le :</Label>
                  <Input
                    name="late-date"
                    type="date"
                    defaultValue={attribution.lateDate?.toLocaleDateString('en-CA')}
                    disabled={attribution.endDate !== null}
                  />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>
                Notes <span className="text-muted-foreground text-xs">(Ne sera pas visible du proclamateur)</span>
              </Label>
              <textarea
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={4}
                name="notes"
                readOnly={attribution.endDate !== null}
              >
                {attribution.notes}
              </textarea>
            </div>

            {shouldShowEndDate ? (
              <Button variant="destructive" type="submit" disabled={attribution.endDate !== null} className="mt-2">
                Rentrer le territoire
              </Button>
            ) : (
              <Button type="submit" disabled={attribution.endDate !== null} className="mt-2">
                Enregistrer l'attribution
              </Button>
            )}
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { can, db } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const form = await request.formData()
  const publisherId = Number(form.get('publisher'))
  const startDateText = String(form.get('start-date'))
  const lateDateText = String(form.get('late-date'))
  const endDateText = String(form.get('end-date'))
  const notes = String(form.get('notes'))
  const type = String(form.get('type'))

  const data: Prisma.XOR<Prisma.AttributionUpdateInput, Prisma.AttributionUncheckedUpdateInput> = {
    publisherId: publisherId,
    notes,
    type,
    startDate: new Date(startDateText),
  }

  const hasLateDate = lateDateText.length > 0 && lateDateText !== 'null'
  if (hasLateDate) {
    data.lateDate = new Date(lateDateText)
  }

  const hasEndDate = endDateText.length > 0 && endDateText !== 'null'
  if (hasEndDate) {
    data.endDate = new Date(endDateText)
  }

  const attribution = await db.attribution.update({
    where: { id: requireParamId(params.attributionId, '/territories/attributions') },
    data,
  })

  return redirect(hasEndDate ? '/territories/attributions' : `/territories/attributions/${attribution.id}/edit`)
}
