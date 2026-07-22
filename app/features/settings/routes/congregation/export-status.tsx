import { CheckCircle2, Download, Loader2, XCircle } from 'lucide-react'
import { useEffect } from 'react'
import { Link, redirect, useRevalidator } from 'react-router'
import { getOwnedDataTransferJob } from '~/features/settings/server/data-transfer.queries'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, requirePermission } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Progress } from '~/shared/ui/progress'
import type { Route } from './+types/export-status'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.export_status_meta_title() }]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.Admin)

  const currentUser = context.get(currentAccountContext)
  const job = await getOwnedDataTransferJob(params.jobId, currentUser.congregationId, 'export')
  if (!job) {
    throw redirect('/settings/data/export')
  }

  const state = await job.getState()
  const progress = typeof job.progress === 'number' ? job.progress : 0

  return {
    state,
    progress,
    jobId: params.jobId,
    failedReason: job.failedReason ?? null,
  }
}

export default function ExportStatusPage({ loaderData }: Route.ComponentProps) {
  const { state, progress, jobId, failedReason } = loaderData
  const revalidator = useRevalidator()

  useEffect(() => {
    if (state === 'completed' || state === 'failed') return

    const interval = setInterval(() => {
      revalidator.revalidate()
    }, 2000)

    return () => clearInterval(interval)
  }, [state, revalidator])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.export_status_title()}
        subtitle={m.export_status_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_settings(), to: '/settings' },
          { label: m.settings_data_title(), to: '/settings/data' },
          { label: m.export_title(), to: '/settings/data/export' },
          { label: m.export_status_title() },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {state === 'completed' && <CheckCircle2 className="size-5 text-green-600" />}
            {state === 'failed' && <XCircle className="size-5 text-red-600" />}
            {state !== 'completed' && state !== 'failed' && <Loader2 className="size-5 animate-spin" />}
            {state === 'completed'
              ? m.export_status_completed()
              : state === 'failed'
                ? m.export_status_failed()
                : m.export_status_title()}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state !== 'completed' && state !== 'failed' && (
            <>
              <Progress value={progress} className="w-full" />
              <p className="text-muted-foreground text-sm">
                {progress > 0 ? m.export_status_progress({ progress: String(progress) }) : m.export_status_waiting()}
              </p>
            </>
          )}

          {state === 'completed' && (
            <>
              <p className="text-sm">{m.export_status_completed_message()}</p>
              <Button asChild>
                <a href={`/settings/data/export/${jobId}/download`}>
                  <Download className="mr-2 size-4" />
                  {m.export_status_download()}
                </a>
              </Button>
            </>
          )}

          {state === 'failed' && (
            <>
              <p className="text-destructive text-sm">{m.export_status_failed_message()}</p>
              {failedReason && <p className="text-muted-foreground text-xs">{failedReason}</p>}
              <Button variant="outline" asChild>
                <Link to="/settings/data/export">{m.export_status_back()}</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
