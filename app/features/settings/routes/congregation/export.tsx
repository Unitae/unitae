import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Download } from 'lucide-react'
import { Form, redirect } from 'react-router'
import { exportOptionsSchema } from '~/features/settings/schemas/data-transfer.schema'
import { dataTransferQueue } from '~/features/settings/server/data-transfer-queue.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, requirePermission, userContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Checkbox } from '~/shared/ui/checkbox'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import type { Route } from './+types/export'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.export_meta_title() }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  requirePermission(permissions, Permission.Admin)

  const jobs = await dataTransferQueue.getJobs(['completed'])
  const completedExports = jobs
    .filter(job => job.data.type === 'export' && job.data.congregationId === currentUser.congregationId)
    .sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0))
    .map(job => ({ id: String(job.id), finishedOn: job.finishedOn ?? null }))

  return { completedExports }
}

export default function ExportPage({ loaderData, actionData }: Route.ComponentProps) {
  const { completedExports } = loaderData
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

      <Card>
        <CardHeader>
          <CardTitle>{m.export_history_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          {completedExports.length === 0 ? (
            <p className="text-muted-foreground text-sm">{m.export_history_empty()}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.export_history_date()}</TableHead>
                  <TableHead className="text-right">{m.export_history_download()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedExports.map(job => (
                  <TableRow key={job.id}>
                    <TableCell>
                      {job.finishedOn
                        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
                            new Date(job.finishedOn),
                          )
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <a href={`/settings/data/export/${job.id}/download`}>
                          <Download className="mr-2 size-4" />
                          {m.export_history_download()}
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.Admin)

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
