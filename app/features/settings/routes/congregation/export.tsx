import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Form, redirect } from 'react-router'
import { exportOptionsSchema } from '~/features/settings/schemas/data-transfer.schema'
import { dataTransferQueue } from '~/features/settings/server/data-transfer-queue.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, requireRole } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Checkbox } from '~/shared/ui/checkbox'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import type { Route } from './+types/export'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.export_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requireRole(permissions, Role.Admin)
  return null
}

export default function ExportPage({ actionData }: Route.ComponentProps) {
  const [form] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: exportOptionsSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.export_title()}
        subtitle={m.export_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_settings(), to: '/settings' },
          { label: m.settings_data_title(), to: '/settings/data' },
          { label: m.export_title() },
        ]}
      />

      <Form method="post" {...getFormProps(form)} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{m.export_title()}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2">
              <Checkbox id="includeFiles" name="includeFiles" value="on" />
              <div className="space-y-1">
                <Label htmlFor="includeFiles" className="font-normal">
                  {m.export_include_files()}
                </Label>
                <p className="text-muted-foreground text-xs">{m.export_include_files_hint()}</p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Checkbox id="includeAuditLogs" name="includeAuditLogs" value="on" />
              <div className="space-y-1">
                <Label htmlFor="includeAuditLogs" className="font-normal">
                  {m.export_include_audit_logs()}
                </Label>
                <p className="text-muted-foreground text-xs">{m.export_include_audit_logs_hint()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <SubmitButton>{m.export_submit()}</SubmitButton>
      </Form>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requireRole(permissions, Role.Admin)

  const currentUser = context.get(userContext)
  const formData = await request.formData()
  const submission = parseWithZod(formData, { schema: exportOptionsSchema })

  if (submission.status !== 'success') {
    return submission.reply()
  }

  const job = await dataTransferQueue.add('export', {
    type: 'export',
    congregationId: currentUser.congregationId,
    userId: currentUser.id,
    options: {
      includeFiles: submission.value.includeFiles,
      includeAuditLogs: submission.value.includeAuditLogs,
    },
  })

  return redirect(`/settings/data/export/${job.id}/status`)
}
