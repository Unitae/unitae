import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { Building2 } from 'lucide-react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { createBuildingSchema } from '~/features/territories/schemas/building.schema'
import { createBuilding } from '~/features/territories/server/create-building.server'
import { BuildingAddressSections } from '~/features/territories/ui/BuildingAddressSections'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { FormSaveBar } from '~/shared/ui/FormSaveBar'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'

import type { Route } from './+types/new-building'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.prospection_new_building_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.CanManageBuildings)

  return { canViewProspection: permissions.has(Permission.CanViewProspection) }
}

export default function CreateBuildingPage({ loaderData, actionData }: Route.ComponentProps) {
  const { canViewProspection } = loaderData
  useFocusError(actionData)
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: createBuildingSchema })
    },
  })

  return (
    <div className="flex flex-col">
      <PageHeader
        icon={Building2}
        title={m.prospection_new_building_title()}
        subtitle={m.prospection_new_building_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_prospection(), to: canViewProspection ? '/territories/buildings' : undefined },
          { label: m.prospection_new_building_title() },
        ]}
      />
      <Form method="post" {...getFormProps(form)} className="flex flex-col pb-24">
        <BuildingAddressSections fields={fields} />
        {/* Nothing exists yet to compare with: the bar stays, without a count. */}
        <FormSaveBar changes={null}>
          {canViewProspection && (
            <Button asChild variant="ghost">
              <Link to="/territories/buildings">{m.common_cancel()}</Link>
            </Button>
          )}
          <SubmitButton>{m.prospection_new_building_submit()}</SubmitButton>
        </FormSaveBar>
      </Form>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.CanManageBuildings)

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
