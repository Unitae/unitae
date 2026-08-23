import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { editCongregationSchema } from '~/features/platform-admin/schemas/congregation.schema'
import { verifyPlatformAdmin } from '~/features/platform-admin/server/verify-platform-admin.server'
import * as m from '~/i18n/paraglide/messages'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { unscopedDb } from '~/shared/infra/db.server'
import { Badge } from '~/shared/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { FormActions } from '~/shared/ui/FormActions'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Separator } from '~/shared/ui/separator'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit-congregation'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.platform_admin_edit_congregation_meta_title() }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await verifyPlatformAdmin(request)

  const congregation = await unscopedDb.congregation.findUnique({
    where: { id: requireParamId(params.congregationId, '/platform-admin/congregations') },
    include: {
      _count: { select: { users: true, territories: true, buildings: true } },
    },
  })

  if (!congregation) throw redirect('/platform-admin/congregations')

  return {
    congregation: {
      id: congregation.id,
      name: congregation.name,
      slug: congregation.slug,
      domain: congregation.domain,
      displayName: congregation.displayName,
      emailFromName: congregation.emailFromName,
      emailFromAddress: congregation.emailFromAddress,
      baseUrl: congregation.baseUrl,
      locale: congregation.locale,
      timezone: congregation.timezone,
      active: congregation.active,
      stats: congregation._count,
    },
  }
}

export default function EditCongregationPage({ loaderData, actionData }: Route.ComponentProps) {
  const { congregation } = loaderData

  const [form, fields] = useForm({
    lastResult: actionData,
    defaultValue: {
      name: congregation.name,
      slug: congregation.slug,
      domain: congregation.domain ?? '',
      displayName: congregation.displayName ?? '',
      active: congregation.active ? 'on' : undefined,
    },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: editCongregationSchema })
    },
  })

  const { blocker, markDirty } = useUnsavedChanges()

  return (
    <div className="space-y-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={congregation.name}
        breadcrumbs={[{ label: m.sidebar_administration(), to: '/platform-admin' }, { label: congregation.name }]}
        backTo="/platform-admin"
      />

      <div className="flex gap-3">
        <Badge variant="secondary">
          {m.platform_admin_edit_congregation_users({ count: congregation.stats.users })}
        </Badge>
        <Badge variant="secondary">
          {m.platform_admin_edit_congregation_territories({ count: congregation.stats.territories })}
        </Badge>
        <Badge variant="secondary">
          {m.platform_admin_edit_congregation_buildings({ count: congregation.stats.buildings })}
        </Badge>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{m.platform_admin_edit_congregation_general_info()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4" {...getFormProps(form)} onChange={markDirty}>
            <div className="space-y-2">
              <Label htmlFor={fields.name.id}>{m.platform_admin_edit_congregation_name_label()}</Label>
              <Input {...getInputProps(fields.name, { type: 'text' })} />
              {fields.name.errors && <p className="text-destructive text-sm">{fields.name.errors}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor={fields.slug.id}>{m.platform_admin_edit_congregation_slug_label()}</Label>
              <Input {...getInputProps(fields.slug, { type: 'text' })} />
              {fields.slug.errors && <p className="text-destructive text-sm">{fields.slug.errors}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor={fields.domain.id}>{m.platform_admin_edit_congregation_domain_label()}</Label>
              <Input {...getInputProps(fields.domain, { type: 'text' })} />
              {fields.domain.errors && <p className="text-destructive text-sm">{fields.domain.errors}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor={fields.displayName.id}>{m.platform_admin_edit_congregation_display_name_label()}</Label>
              <Input {...getInputProps(fields.displayName, { type: 'text' })} />
              {fields.displayName.errors && <p className="text-destructive text-sm">{fields.displayName.errors}</p>}
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <input
                {...getInputProps(fields.active, { type: 'checkbox' })}
                className="size-4 rounded border-input accent-primary"
              />
              <Label htmlFor={fields.active.id}>{m.platform_admin_edit_congregation_active_label()}</Label>
            </div>

            <FormActions className="pt-2">
              <SubmitButton>{m.common_save()}</SubmitButton>
            </FormActions>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const admin = await verifyPlatformAdmin(request)

  const submission = parseWithZod(await request.formData(), { schema: editCongregationSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const congregationId = requireParamId(params.congregationId, '/platform-admin/congregations')
  const { name, slug, domain, displayName, active } = submission.value

  await unscopedDb.congregation.update({
    where: { id: congregationId },
    data: { name, slug, domain, displayName, active },
  })

  audit({
    action: AuditAction.PlatformCongregationUpdated,
    congregationId: admin.congregationId,
    actorId: admin.userId,
    actorEmail: admin.email,
    entityType: 'Congregation',
    entityId: congregationId,
    metadata: { name, slug, domain, displayName, active },
  })

  return redirect('/platform-admin/congregations')
}
