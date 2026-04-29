import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { createBuildingSchema } from '~/features/territories/schemas/building.schema'
import { createBuilding } from '~/features/territories/server/create-building.server'
import * as m from '~/paraglide/messages'
import { congregationContext, permissionsContext, withScopeFromContext, requireRole } from '~/shared/auth/route-context.server'
import { useFocusError } from '~/shared/hooks/use-focus-error'
import { Role } from '~/shared/types/role'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'

import type { Route } from './+types/new-building'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.prospection_new_building_meta_title() }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requireRole(permissions, Role.TerritoriesManager)

  return null
}

export default function CreateBuildingPage({ actionData }: Route.ComponentProps) {
  useFocusError(actionData)
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: createBuildingSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.prospection_new_building_title()}
        subtitle={m.prospection_new_building_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_prospection(), to: '/territories/buildings' },
          { label: m.prospection_new_building_title() },
        ]}
        backTo="/territories/buildings"
      />

      <Card>
        <CardContent className="pt-6">
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={fields.number.id}>{m.territories_form_number()}</Label>
              <Input
                {...getInputProps(fields.number, { type: 'text' })}
                placeholder={m.prospection_new_building_number_placeholder()}
              />
              {fields.number.errors && <p className="text-destructive text-sm">{fields.number.errors}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={fields.street.id}>{m.prospection_new_building_street_label()}</Label>
              <Input
                {...getInputProps(fields.street, { type: 'text' })}
                placeholder={m.prospection_new_building_street_placeholder()}
              />
              {fields.street.errors && <p className="text-destructive text-sm">{fields.street.errors}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={fields.zip.id}>{m.prospection_new_building_zip_label()}</Label>
              <Input
                {...getInputProps(fields.zip, { type: 'text' })}
                placeholder={m.prospection_new_building_zip_placeholder()}
              />
              {fields.zip.errors && <p className="text-destructive text-sm">{fields.zip.errors}</p>}
            </div>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={fields.latitude.id}>{m.prospection_table_latitude()}</Label>
                <Input {...getInputProps(fields.latitude, { type: 'number' })} step={0.0000001} />
                {fields.latitude.errors && <p className="text-destructive text-sm">{fields.latitude.errors}</p>}
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={fields.longitude.id}>{m.prospection_table_longitude()}</Label>
                <Input {...getInputProps(fields.longitude, { type: 'number' })} step={0.0000001} />
                {fields.longitude.errors && <p className="text-destructive text-sm">{fields.longitude.errors}</p>}
              </div>
            </div>
            <SubmitButton className="mt-2">{m.prospection_new_building_submit()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requireRole(permissions, Role.TerritoriesManager)

  const submission = parseWithZod(await request.formData(), { schema: createBuildingSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { number, street, zip, latitude, longitude } = submission.value
  const congregation = context.get(congregationContext)

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    const building = await createBuilding(db, {
      address: { number, street, zip },
      coordinates: {
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
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
