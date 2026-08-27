import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Trash2 } from 'lucide-react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { updateBuildingSchema } from '~/features/territories/schemas/building.schema'
import { editBuilding } from '~/features/territories/server/edit-building.server'
import { getBuildingDetails } from '~/features/territories/server/get-building-details.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, requirePermission, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { FormActions } from '~/shared/ui/FormActions'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit-building'

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [{ title: 'Unitae' }]
  return [
    {
      title: `Modification du ${loaderData.building.number} ${loaderData.building.street}, ${loaderData.building.zip} - Unitae`,
    },
  ]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.CanManageBuildings)

  return withScopeFromContext(context, async (db, congregationId) => {
    const building = await getBuildingDetails(
      db,
      requireParamId(params.buildingId, '/territories/buildings'),
      congregationId,
    )
    if (building == null) {
      throw redirect('/territories/buildings', { status: 404 })
    }

    return { building }
  })
}

export default function EditBuildingPage({ loaderData, actionData }: Route.ComponentProps) {
  const { building } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()
  useFocusError(actionData)
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: updateBuildingSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={`Modification du ${building.number} ${building.street}, ${building.zip}`}
        subtitle={m.prospection_edit_building_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_prospection(), to: '/territories/buildings' },
          { label: m.prospection_building_edit_title() },
        ]}
        backTo="/territories/buildings"
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
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4" onChange={markDirty}>
            <h2 className="font-semibold text-lg">{m.prospection_building_identification()}</h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={fields.number.id}>{m.territories_form_number()}</Label>
              <Input
                {...getInputProps(fields.number, { type: 'text' })}
                placeholder={m.prospection_new_building_number_placeholder()}
                defaultValue={building.number}
              />
              {fields.number.errors && <p className="text-destructive text-sm">{fields.number.errors}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={fields.street.id}>{m.prospection_new_building_street_label()}</Label>
              <Input
                {...getInputProps(fields.street, { type: 'text' })}
                placeholder={m.prospection_new_building_street_placeholder()}
                defaultValue={building.street}
              />
              {fields.street.errors && <p className="text-destructive text-sm">{fields.street.errors}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={fields.zip.id}>{m.prospection_new_building_zip_label()}</Label>
              <Input
                {...getInputProps(fields.zip, { type: 'text' })}
                placeholder={m.prospection_new_building_zip_placeholder()}
                defaultValue={building.zip}
              />
              {fields.zip.errors && <p className="text-destructive text-sm">{fields.zip.errors}</p>}
            </div>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={fields.latitude.id}>{m.prospection_table_latitude()}</Label>
                <Input
                  {...getInputProps(fields.latitude, { type: 'number' })}
                  defaultValue={building.latitude ?? ''}
                  step={0.0000001}
                />
                {fields.latitude.errors && <p className="text-destructive text-sm">{fields.latitude.errors}</p>}
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={fields.longitude.id}>{m.prospection_table_longitude()}</Label>
                <Input
                  {...getInputProps(fields.longitude, { type: 'number' })}
                  defaultValue={building.longitude ?? ''}
                  step={0.0000001}
                />
                {fields.longitude.errors && <p className="text-destructive text-sm">{fields.longitude.errors}</p>}
              </div>
            </div>

            <FormActions>
              <SubmitButton>{m.prospection_edit_building_submit()}</SubmitButton>
            </FormActions>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.CanManageBuildings)

  const submission = parseWithZod(await request.formData(), { schema: updateBuildingSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { number, street, zip, latitude, longitude } = submission.value

  return withScopeFromContext(context, async (db, congregationId) => {
    const session = await getSession(request.headers.get('Cookie'))
    try {
      await editBuilding(db, requireParamId(params.buildingId, '/territories/buildings'), congregationId, {
        coordinates: {
          latitude: latitude ?? undefined,
          longitude: longitude ?? undefined,
        },
        address: { number, street, zip },
      })

      session.flash('success', m.prospection_edit_building_success())
    } catch (e) {
      if (e != null && typeof e === 'object' && 'code' in e && e.code === 'P2002') {
        session.flash('error', m.prospection_edit_building_duplicate_error())
      } else {
        logger.error('Error updating building', { error: e, buildingId: params.buildingId })
        session.flash('error', m.prospection_edit_building_error())
      }
    }

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? `/territories/building/${params.buildingId}/view`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
