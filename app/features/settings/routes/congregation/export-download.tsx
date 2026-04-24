import { redirect } from 'react-router'
import { dataTransferQueue } from '~/features/settings/server/data-transfer-queue.server'
import { permissionsContext } from '~/shared/auth/route-context.server'
import { getFileBuffer } from '~/shared/infra/file-storage.server'
import { Role } from '~/shared/types/role'
import type { Route } from './+types/export-download'

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.Admin)) {
    throw redirect('/')
  }

  const job = await dataTransferQueue.getJob(params.jobId)
  if (!job) {
    throw redirect('/settings/congregation/export')
  }

  const state = await job.getState()
  if (state !== 'completed' || !job.returnvalue) {
    throw redirect(`/settings/congregation/export/${params.jobId}/status`)
  }

  const storageKey = job.returnvalue as string
  const buffer = await getFileBuffer(storageKey)
  if (!buffer) {
    throw redirect(`/settings/congregation/export/${params.jobId}/status`)
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
