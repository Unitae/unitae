import { Form, redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { getBoolSetting, getSetting, setSetting } from '~/features/settings/server/settings'
import { getTerritoryPolygon } from '~/features/territories/server/get-territory-polygon.server'
import {
  getAllowedZips,
  parseTerritoryPolygon,
  parseZips,
  serializeTerritoryPolygon,
  serializeZips,
} from '~/features/territories/server/settings'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
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
  return [{ title: m.settings_territories_meta_title() }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const territory = await getTerritoryPolygon(db)
    const zips = await getAllowedZips(db)
    const banoUrl = await getSetting(db, TerritorySettingKey.BanoUrl, congregationId)
    const prospectionValidity = await getSetting(db, TerritorySettingKey.ProspectionValidity, congregationId)
    const phoneTypeActivated = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)

    return {
      territory: serializeTerritoryPolygon(territory),
      zips: serializeZips(zips),
      banoUrl: banoUrl ?? '',
      prospectionValidity: Number(prospectionValidity ?? '24'),
      phoneTypeActivated: phoneTypeActivated ?? false,
    }
  })
}

export default function BuildingSettingsPage({ loaderData }: Route.ComponentProps) {
  const { territory, zips, banoUrl, prospectionValidity, phoneTypeActivated } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.settings_territories_title()} subtitle={m.settings_territories_subtitle()} />

      <Form method="post" className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{m.settings_territories_prospection_title()}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="bano-url">{m.settings_territories_bano_url_label()}</Label>
              <Input
                id="bano-url"
                name="bano-url"
                type="text"
                placeholder={m.settings_territories_bano_url_placeholder()}
                defaultValue={banoUrl}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zips">{m.settings_territories_zips_label()}</Label>
              <Input
                id="zips"
                name="zips"
                type="text"
                placeholder={m.settings_territories_zips_placeholder()}
                defaultValue={zips}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prospection-validity">{m.settings_territories_prospection_validity_label()}</Label>
              <Input
                id="prospection-validity"
                name="prospection-validity"
                type="number"
                placeholder={m.settings_territories_prospection_validity_placeholder()}
                defaultValue={prospectionValidity}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.settings_territories_territory_title()}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="territory">{m.settings_territories_polygon_label()}</Label>
              <Input
                id="territory"
                name="territory"
                type="text"
                placeholder={m.settings_territories_polygon_placeholder()}
                defaultValue={territory}
              />
            </div>

            <Separator />

            <p className="font-medium text-sm">{m.settings_territories_types_title()}</p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="phone-territory-active"
                name="phone-territory-active"
                value="on"
                defaultChecked={phoneTypeActivated}
              />
              <Label htmlFor="phone-territory-active" className="font-normal">
                {m.settings_territories_phone_type_before()}{' '}
                <span className="font-bold text-primary">{m.settings_territories_phone_type_highlight()}</span>
                {m.settings_territories_phone_type_after()}
              </Label>
            </div>
          </CardContent>
        </Card>

        <Button type="submit">{m.common_save()}</Button>
      </Form>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const form = await request.formData()
  const zips = parseZips(String(form.get('zips')))
  const territory = parseTerritoryPolygon(String(form.get('territory')))
  const banoUrl = String(form.get('bano-url'))
  const prospectionValidity = String(form.get('prospection-validity'))
  const phoneTypeActivated = String(Boolean(form.get('phone-territory-active')))

  return withScope(congregationId, async db => {
    await setSetting(db, TerritorySettingKey.TerritoryPolygone, JSON.stringify(territory), congregationId)
    await setSetting(db, TerritorySettingKey.TerritoryZipCodes, JSON.stringify(zips), congregationId)
    await setSetting(db, TerritorySettingKey.BanoUrl, banoUrl, congregationId)
    await setSetting(db, TerritorySettingKey.ProspectionValidity, prospectionValidity, congregationId)
    await setSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, phoneTypeActivated, congregationId)

    return redirect('/settings')
  })
}
