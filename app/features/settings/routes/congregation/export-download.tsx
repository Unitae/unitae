import { redirect } from 'react-router'
import { dataTransferQueue } from '~/features/settings/server/data-transfer-queue.server'
import { permissionsContext, requirePermission } from '~/shared/auth/route-context.server'
import { getFileBuffer } from '~/shared/infra/file-storage.server'
import { Permission } from '~/shared/types/permission'
import type { Route } from './+types/export-download'

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.Admin)

  const job = await dataTransferQueue.getJob(params.jobId)
  if (!job) {
    throw redirect('/settings/data/export')
  }

  const state = await job.getState()
  if (state !== 'completed' || !job.returnvalue) {
    throw redirect(`/settings/data/export/${params.jobId}/status`)
  }

  const storageKey = job.returnvalue as string
  const buffer = await getFileBuffer(storageKey)
  if (!buffer) {
    throw redirect(`/settings/data/export/${params.jobId}/status`)
  }

  const date = new Date().toISOString().slice(0, 10)

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="unitae-export-${date}.unitae"`,
      'Content-Length': String(buffer.length),
    },
  })
}
