import { Form, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getBoolSetting, getSetting, setSetting } from '~/features/settings/server/settings'
import { getTerritoryPolygon } from '~/features/territories/server/get-territory-polygon.server'
import {
  getAllowedZips,
  parseTerritoryPolygon,
  parseZips,
  serializeTerritoryPolygon,
  serializeZips,
} from '~/features/territories/server/settings'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Checkbox } from '~/shared/ui/checkbox'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Separator } from '~/shared/ui/separator'

import type { Route } from './+types/settings'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Paramètres des Territoires - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const territory = await getTerritoryPolygon()
  const zips = await getAllowedZips()
  const banoUrl = await getSetting(TerritorySettingKey.BanoUrl)
  const prospectionValidity = await getSetting(TerritorySettingKey.ProspectionValidity)
  const phoneTypeActivated = await getBoolSetting(TerritorySettingKey.TerritoryTypePhoneActive)

  return {
    territory: serializeTerritoryPolygon(territory),
    zips: serializeZips(zips),
    banoUrl: banoUrl ?? '',
    prospectionValidity: Number(prospectionValidity ?? '24'),
    phoneTypeActivated: phoneTypeActivated ?? false,
  }
}

export default function BuildingSettingsPage({ loaderData }: Route.ComponentProps) {
  const { territory, zips, banoUrl, prospectionValidity, phoneTypeActivated } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Territoires" subtitle='Paramètres du module "Territoire"' />

      <Form method="post" className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Prospection</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="bano-url">Adresse URL de la Base d'Adresses Nationale Ouverte - BANO</Label>
              <Input
                id="bano-url"
                name="bano-url"
                type="text"
                placeholder="Adresse vers le fichier CSV"
                defaultValue={banoUrl}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zips">Code postaux à récuperer depuis la Base d'Adresses Nationale Ouverte - BANO</Label>
              <Input
                id="zips"
                name="zips"
                type="text"
                placeholder="Code postaux séparés par des virgules"
                defaultValue={zips}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prospection-validity">Validité de la prospection</Label>
              <Input
                id="prospection-validity"
                name="prospection-validity"
                type="number"
                placeholder="Entrez la durée de validité de la prospection en mois"
                defaultValue={prospectionValidity}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Territoire</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="territory">Polygone du territoire</Label>
              <Input
                id="territory"
                name="territory"
                type="text"
                placeholder="Entrez les coordonnées du polygone : latitude longitude,latitude longitude,..."
                defaultValue={territory}
              />
            </div>

            <Separator />

            <p className="font-medium text-sm">Types de territoires</p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="phone-territory-active"
                name="phone-territory-active"
                value="on"
                defaultChecked={phoneTypeActivated}
              />
              <Label htmlFor="phone-territory-active" className="font-normal">
                Activer la gestion des territoires <span className="font-bold text-primary">téléphone</span>.
              </Label>
            </div>
          </CardContent>
        </Card>

        <Button type="submit">Enregistrer</Button>
      </Form>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { congregation } = await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const form = await request.formData()
  const zips = parseZips(String(form.get('zips')))
  const territory = parseTerritoryPolygon(String(form.get('territory')))
  const banoUrl = String(form.get('bano-url'))
  const prospectionValidity = String(form.get('prospection-validity'))
  const phoneTypeActivated = String(Boolean(form.get('phone-territory-active')))

  await setSetting(TerritorySettingKey.TerritoryPolygone, JSON.stringify(territory), congregation.id)
  await setSetting(TerritorySettingKey.TerritoryZipCodes, JSON.stringify(zips), congregation.id)
  await setSetting(TerritorySettingKey.BanoUrl, banoUrl, congregation.id)
  await setSetting(TerritorySettingKey.ProspectionValidity, prospectionValidity, congregation.id)
  await setSetting(TerritorySettingKey.TerritoryTypePhoneActive, phoneTypeActivated, congregation.id)

  return redirect('/settings')
}
