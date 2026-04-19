import { Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { createBuilding } from '~/features/territories/server/create-building.server'
import * as m from '~/paraglide/messages'
import { congregationContext, permissionsContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/new-building'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.prospection_new_building_meta_title() }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.TerritoriesManager)) {
    throw redirect('/')
  }

  return null
}

export default function CreateBuildingPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.prospection_new_building_title()} subtitle={m.prospection_new_building_subtitle()} />

      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>{m.territories_form_number()}</Label>
              <Input name="number" type="text" placeholder={m.prospection_new_building_number_placeholder()} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{m.prospection_new_building_street_label()}</Label>
              <Input name="street" type="text" placeholder={m.prospection_new_building_street_placeholder()} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{m.prospection_new_building_zip_label()}</Label>
              <Input name="zip" type="text" placeholder={m.prospection_new_building_zip_placeholder()} required />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>{m.prospection_table_latitude()}</Label>
                <Input name="latitude" type="number" step={0.0000001} />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>{m.prospection_table_longitude()}</Label>
                <Input name="longitude" type="number" step={0.0000001} />
              </div>
            </div>
            <Button type="submit" className="mt-2">
              {m.prospection_new_building_submit()}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.TerritoriesManager)) {
    throw redirect('/')
  }

  const form = await request.formData()
  const number = form.get('number')
  const street = form.get('street')
  const zip = form.get('zip')
  const latitude = form.get('latitude')
  const longitude = form.get('longitude')

  if (!number || !street || !zip) {
    throw redirect('/territories/buildings/new')
  }

  const congregation = context.get(congregationContext)

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    const building = await createBuilding(db, {
      address: {
        number: String(number),
        street: String(street),
        zip: String(zip),
      },
      coordinates: {
        latitude: latitude ? Number.parseFloat(latitude.toString()) : undefined,
        longitude: longitude ? Number.parseFloat(longitude.toString()) : undefined,
      },
      congregationId: congregation.id,
    })

    if (building == null) {
      session.flash('error', m.prospection_new_building_error())
    } else {
      session.flash('success', m.prospection_new_building_success())
    }

    return redirect(`/territories/building/${building.id}/view`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
