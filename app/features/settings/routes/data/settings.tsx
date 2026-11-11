import { redirect } from 'react-router'
import { getOwnedDataTransferJob } from '~/features/settings/server/data-transfer.queries'
import { dataTransferQueue } from '~/features/settings/server/data-transfer-queue.server'
import { validateImport } from '~/features/settings/server/import-congregation.server'
import { DataExportSection } from '~/features/settings/ui/DataExportSection'
import { DataImportSection } from '~/features/settings/ui/DataImportSection'
import { SettingsHeader } from '~/features/settings/ui/SettingsHeader'
import * as m from '~/i18n/paraglide/messages'
import { congregationContext, currentAccountContext, permissionsContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { handleDataAction, importStorageKey } from './_data-action.server'
import type { Route } from './+types/settings'

export const meta: Route.MetaFunction = () => [{ title: m.settings_data_meta_title() }]

function rightsOf(permissions: Set<Permission>) {
  // An import restores roles, permissions, accounts and assignments, so it can grant anything: admin only.
  const canImport = permissions.has(Permission.CanImportCongregationData) && permissions.has(Permission.CanDoAnything)
  return { canExport: permissions.has(Permission.CanExportCongregationData), canImport }
}

async function jobOf(jobId: string | null, congregationId: number, actorId: number, type: 'export' | 'import') {
  if (!jobId) return null
  const job = await getOwnedDataTransferJob(jobId, congregationId, actorId, type)
  if (!job) return null
  return {
    id: jobId,
    state: await job.getState(),
    progress: typeof job.progress === 'number' ? job.progress : 0,
    failedReason: job.failedReason ?? null,
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { canExport, canImport } = rightsOf(context.get(permissionsContext))
  if (!canExport && !canImport) throw redirect('/settings')
  const currentUser = context.get(currentAccountContext)
  const { congregationId } = currentUser
  const params = new URL(request.url).searchParams

  let history: { id: string; finishedOn: number | null }[] = []
  if (canExport) {
    const jobs = await dataTransferQueue.getJobs(['completed'])
    history = jobs
      .filter(job => job.data.type === 'export' && job.data.congregationId === congregationId)
      .sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0))
      .map(job => ({ id: String(job.id), finishedOn: job.finishedOn ?? null }))
  }

  // The archive waiting for its confirmation is read again from where it was kept, from its id alone.
  let pending = null
  let expired = false
  const archive = params.get('import')
  if (canImport && archive) {
    const storageKey = importStorageKey(congregationId, archive)
    try {
      pending = storageKey ? { archive, summary: await validateImport(storageKey, congregationId) } : null
    } catch {
      pending = null
    }
    expired = pending == null
  }

  return {
    canExport,
    canImport,
    history,
    timeZone: context.get(congregationContext).timezone,
    exportJob: canExport ? await jobOf(params.get('export'), congregationId, currentUser.id, 'export') : null,
    importJob: canImport ? await jobOf(params.get('importJob'), congregationId, currentUser.id, 'import') : null,
    pending,
    expired,
  }
}

export function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  // Each intent checks its own right; a caller holding neither is turned away before the form is read.
  if (!permissions.has(Permission.CanExportCongregationData) && !permissions.has(Permission.CanImportCongregationData))
    throw redirect('/settings')
  const currentUser = context.get(currentAccountContext)
  return handleDataAction(request, {
    id: currentUser.id,
    congregationId: currentUser.congregationId,
    ...rightsOf(permissions),
  })
}

export default function DataPage({ loaderData }: Route.ComponentProps) {
  const { canExport, canImport, history, timeZone, exportJob, importJob, pending, expired } = loaderData
  return (
    <div className="flex max-w-4xl flex-col">
      <SettingsHeader title={m.settings_entry_data()} subtitle={m.settings_data_subtitle()} />
      <div className="flex flex-col">
        {canExport && <DataExportSection job={exportJob} history={history} timeZone={timeZone} />}
        {canImport && <DataImportSection job={importJob} pending={pending} expired={expired} />}
      </div>
    </div>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
