import { ArrowRight } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { updateCongregationSettings } from '~/features/settings/server/congregation-settings.server'
import { getBoolSetting } from '~/features/settings/server/settings.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Checkbox } from '~/shared/ui/checkbox'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import type { Route } from './+types/settings'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_congregation_meta_title() }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { congregation, can, congregationId } = await authenticateAndAuthorize(request, [Role.Admin])
  const canManageSettings = can(Role.Admin)

  if (!canManageSettings) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const auxiliaryPioneerProfileActivated = await getBoolSetting(
      db,
      CongregationSettingKey.AuxiliaryPioneerProfileActivated,
      congregationId,
    )

    return {
      auxiliaryPioneerProfileActivated: auxiliaryPioneerProfileActivated ?? false,
      congregationDisplayName: congregation.displayName,
    }
  })
}

export default function BuildingSettingsPage({ loaderData }: Route.ComponentProps) {
  const { auxiliaryPioneerProfileActivated, congregationDisplayName } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.settings_congregation_title()} subtitle={m.settings_congregation_subtitle()} />

      <Form method="post" className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{m.settings_congregation_local_title()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="displayName">{m.settings_congregation_display_name_label()}</Label>
              <Input
                id="displayName"
                name="displayName"
                type="text"
                placeholder={m.settings_congregation_display_name_placeholder()}
                defaultValue={congregationDisplayName}
              />
              <p className="text-muted-foreground text-xs">{m.settings_congregation_display_name_hint()}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.settings_congregation_publishers_title()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Checkbox
                id="auxiliary-pioneer"
                name={CongregationSettingKey.AuxiliaryPioneerProfileActivated}
                value="on"
                defaultChecked={auxiliaryPioneerProfileActivated}
              />
              <Label htmlFor="auxiliary-pioneer" className="font-normal">
                {m.settings_congregation_auxiliary_pioneer_before()}{' '}
                <span className="font-bold text-primary">{m.settings_congregation_auxiliary_pioneer_highlight()}</span>{' '}
                {m.settings_congregation_auxiliary_pioneer_after()}
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.settings_congregation_programs_title()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-5 rounded-lg border p-4">
              <span className="text-sm">{m.settings_congregation_program_templates_link()}</span>
              <Button variant="ghost" size="sm" asChild>
                <Link to="./templates" className="flex items-center gap-2">
                  {m.settings_congregation_program_templates_see_all()} <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Button type="submit">{m.common_save()}</Button>
      </Form>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { congregation, can, congregationId } = await authenticateAndAuthorize(request, [Role.Admin])
  const canManageSettings = can(Role.Admin)

  if (!canManageSettings) {
    throw redirect('/')
  }

  const form = await request.formData()
  const displayName = form.get('displayName')
  const auxiliaryPioneerProfileActivated = String(
    Boolean(form.get(CongregationSettingKey.AuxiliaryPioneerProfileActivated)),
  )

  return withScope(congregationId, async db => {
    await updateCongregationSettings(db, congregation.id, {
      displayName: displayName ? String(displayName) : null,
      auxiliaryPioneerProfileActivated,
    })

    return redirect('/settings')
  })
}
