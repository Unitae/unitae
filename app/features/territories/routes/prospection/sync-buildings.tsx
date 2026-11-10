import { redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/index.server'
import { BuildingSyncError } from '~/features/territories/model/building-sync.type'
import { failBuildingSync, startBuildingSync } from '~/features/territories/server/building-sync.server'
import { syncQueue } from '~/features/territories/server/sync-queue.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  layoutGate,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import { createLogger } from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/sync-buildings'

const logger = createLogger('prospection-sync')

export const meta: Route.MetaFunction = () => {
  return [{ title: m.prospection_sync_meta_title() }]
}

// As a middleware, the gate covers the action too, not only the page.
export const middleware: Route.MiddlewareFunction[] = [
  layoutGate(permissions => permissions.has(Permission.CanViewProspection)),
]

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.CanManageBuildings)

  const currentUser = context.get(currentAccountContext)
  const congregationId = currentUser.congregationId
  const session = await getSession(request.headers.get('Cookie'))

  const started = await withScopeFromContext(context, async db => {
    try {
      return await startBuildingSync(db, { congregationId, actorId: currentUser.id })
    } catch (error) {
      if (error instanceof ConflictError) return error
      throw error
    }
  })

  if (started instanceof ConflictError) {
    session.flash(
      'error',
      started.message === 'building_sync_running'
        ? m.prospection_sync_flash_running()
        : m.prospection_sync_flash_no_source(),
    )
  } else {
    // Queued once the run is committed, so the worker never looks for a run it cannot see yet.
    try {
      await syncQueue.add(
        'sync',
        { runId: started.id, userId: currentUser.id, congregationId },
        { jobId: `building-sync-${started.id}` },
      )
      session.flash('success', m.prospection_sync_flash_success())
    } catch (error) {
      logger.error('Sync job could not be queued', { congregationId, error })
      await withScopeFromContext(context, db =>
        failBuildingSync(db, { runId: started.id, congregationId, error: BuildingSyncError.Unknown }),
      )
      session.flash('error', m.prospection_sync_flash_error())
    }
  }

  return redirect('/territories/buildings', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
