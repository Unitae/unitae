import { Trash2 } from 'lucide-react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { editBuilding } from '~/features/territories/server/edit-building.server'
import { getBuildingDetails } from '~/features/territories/server/get-building-details.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'

import * as m from '~/paraglide/messages'

import type { Route } from './+types/edit-building'

export const meta: Route.MetaFunction = ({ data }) => {
  return [
    {
      title: `Modification du ${data.building.number} ${data.building.street}, ${data.building.zip} - Unitae`,
    },
  ]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { session, can, congregationId } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const building = await getBuildingDetails(db, requireParamId(params.buildingId, '/territories/buildings'))
    if (building == null) {
      throw redirect('/territories/buildings', { status: 404 })
    }

    const messages = {
      success: session.get('success'),
      error: session.get('error'),
    }

    return data(
      { building, messages },
      {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      },
    )
  })
}

export default function EditBuildingPage({ loaderData }: Route.ComponentProps) {
  const { building, messages } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <AlertMessages messages={messages} />

      <PageHeader
        title={`Modification du ${building.number} ${building.street}, ${building.zip}`}
        subtitle={m.prospection_edit_building_subtitle()}
        actions={
          <Button variant="destructive" size="icon" asChild>
            <Link to={`/territories/building/${building.id}/delete`} title={m.prospection_edit_building_delete_title()}>
              <Trash2 className="size-4" />
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="flex flex-col gap-4">
            <h2 className="font-semibold text-lg">{m.prospection_building_identification()}</h2>
            <div className="flex flex-col gap-1.5">
              <Label>{m.territories_form_number()}</Label>
              <Input
                name="number"
                type="text"
                placeholder={m.prospection_new_building_number_placeholder()}
                required
                defaultValue={building.number}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{m.prospection_new_building_street_label()}</Label>
              <Input name="street" type="text" placeholder={m.prospection_new_building_street_placeholder()} required defaultValue={building.street} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{m.prospection_new_building_zip_label()}</Label>
              <Input
                name="zip"
                type="text"
                placeholder={m.prospection_new_building_zip_placeholder()}
                required
                defaultValue={building.zip}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>{m.prospection_table_latitude()}</Label>
                <Input defaultValue={building.latitude ?? ''} name="latitude" type="number" step={0.0000001} />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>{m.prospection_table_longitude()}</Label>
                <Input defaultValue={building.longitude ?? ''} name="longitude" type="number" step={0.0000001} />
              </div>
            </div>

            <Button type="submit" className="mt-2">
              {m.prospection_edit_building_submit()}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, can, congregationId } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const form = await request.formData()
  const number = form.get('number')
  const street = form.get('street')
  const zip = form.get('zip')
  const latitude = form.get('latitude')
  const longitude = form.get('longitude')

  if (!number || !street || !zip) {
    throw redirect(`/territories/building/${params.buildingId}/edit`)
  }

  return withScope(congregationId, async db => {
    try {
      await editBuilding(db, requireParamId(params.buildingId, '/territories/buildings'), {
        coordinates: {
          latitude: latitude ? Number.parseFloat(latitude.toString()) : undefined,
          longitude: longitude ? Number.parseFloat(longitude.toString()) : undefined,
        },
        address: {
          number: String(number),
          street: String(street),
          zip: String(zip),
        },
      })

      session.flash('success', m.prospection_edit_building_success())
    } catch (e) {
      logger.error('Error updating building', { error: e, buildingId: params.buildingId })
      session.flash('error', m.prospection_edit_building_error())
    }

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? `/territories/building/${params.buildingId}/view`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
