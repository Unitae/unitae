import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { Building2, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { updateBuildingSchema } from '~/features/territories/schemas/building.schema'
import { editBuilding } from '~/features/territories/server/edit-building.server'
import { getBuildingDetails } from '~/features/territories/server/get-building-details.server'
import { BuildingAddressSections } from '~/features/territories/ui/BuildingAddressSections'
import { BuildingMeta } from '~/features/territories/ui/BuildingMeta'
import { DeleteBuildingDialog } from '~/features/territories/ui/DeleteBuildingDialog'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, requirePermission, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { FormSaveBar } from '~/shared/ui/FormSaveBar'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit-building'

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [{ title: 'Unitae' }]
  return [
    {
      title: m.prospection_edit_building_meta_title({
        number: loaderData.building.number,
        street: loaderData.building.street,
        zip: loaderData.building.zip,
      }),
    },
  ]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.CanManageBuildings)
  const rights = {
    canViewProspection: permissions.has(Permission.CanViewProspection),
    canViewTerritories: permissions.has(Permission.CanViewTerritories),
  }

  return withScopeFromContext(context, async (db, congregationId) => {
    const building = await getBuildingDetails(
      db,
      requireParamId(params.buildingId, '/territories/buildings'),
      congregationId,
    )
    if (building == null) {
      throw redirect('/territories/buildings', { status: 404 })
    }

    return { building, rights }
  })
}

export default function EditBuildingPage({ loaderData, actionData }: Route.ComponentProps) {
  const { building, rights } = loaderData
  const { blocker, setDirty } = useUnsavedChanges()
  const [version, setVersion] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const address = `${building.number} ${building.street}`

  return (
    <div className="flex flex-col">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        icon={Building2}
        title={`${address}, ${building.zip}`}
        meta={<BuildingMeta building={building} canViewTerritories={rights.canViewTerritories} />}
        breadcrumbs={[
          { label: m.sidebar_prospection(), to: rights.canViewProspection ? '/territories/buildings' : undefined },
          { label: address, to: rights.canViewProspection ? `/territories/building/${building.id}/view` : undefined },
          { label: m.building_address_crumb() },
        ]}
        actions={
          <Button variant="ghost" className="text-danger-text hover:bg-danger-soft" onClick={() => setDeleting(true)}>
            <Trash2 />
            {m.building_delete_button()}
          </Button>
        }
      />
      <AddressForm
        key={`${version}-${String(building.updatedAt)}`}
        building={building}
        actionData={actionData}
        onDirtyChange={setDirty}
        onCancel={() => setVersion(current => current + 1)}
      />
      <DeleteBuildingDialog building={deleting ? building : null} onClose={() => setDeleting(false)} />
    </div>
  )
}

interface AddressFormProps {
  building: Route.ComponentProps['loaderData']['building']
  actionData: Route.ComponentProps['actionData']
  onDirtyChange: (dirty: boolean) => void
  onCancel: () => void
}

function AddressForm({ building, actionData, onDirtyChange, onCancel }: AddressFormProps) {
  const { ref, changes } = useFormChanges()
  useEffect(() => onDirtyChange(changes > 0), [changes, onDirtyChange])
  useFocusError(actionData)
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: updateBuildingSchema })
    },
  })

  return (
    <Form method="post" {...getFormProps(form)} ref={ref} className="flex flex-col pb-24">
      <BuildingAddressSections fields={fields} defaults={building} />
      {changes > 0 && (
        <FormSaveBar changes={changes}>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {m.common_cancel()}
          </Button>
          <SubmitButton>{m.prospection_edit_building_submit()}</SubmitButton>
        </FormSaveBar>
      )}
    </Form>
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
