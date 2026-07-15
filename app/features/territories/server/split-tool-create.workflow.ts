import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { createTerritoryFromSplit } from '~/features/territories/server/create-territory-from-split.server'
import * as m from '~/i18n/paraglide/messages'
import { AppError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { appErrorToClientMessage } from '~/shared/utils/handle-app-error.server'

export type SplitToolCreateResult =
  | { ok: true; number: string; territoryId: number }
  | { ok: false; error: string; status: number }

type LimitGuard = {
  errorIfWouldGoOverLimit: (name: 'territories') => Promise<void>
}

type WorkflowParams = {
  type: TerritoryKind
  entranceIds: number[]
  congregationId: number
  actorId: number
}

/**
 * Runs the "create one territory from selected entrances" flow, returning a discriminated
 * union suitable for a fetcher response. AppErrors are translated to a client-facing message;
 * anything else re-throws so the framework's error boundary picks it up.
 *
 * Extracted from the route action so the try/catch shape is unit-testable without a route harness.
 */
export async function splitToolCreateWorkflow(
  db: TransactionClient,
  params: WorkflowParams,
  limits: LimitGuard,
): Promise<SplitToolCreateResult> {
  try {
    await limits.errorIfWouldGoOverLimit('territories')
    const territory = await createTerritoryFromSplit(db, params)
    return { ok: true, number: territory.number, territoryId: territory.id }
  } catch (error) {
    if (error instanceof AppError) {
      // Guard against an empty translated message (missing Paraglide key at deploy time): the
      // toast layer treats a falsy string as "no message" and swallows the error silently.
      const message = appErrorToClientMessage(error) || m.common_generic_error() || 'Erreur'
      return { ok: false, error: message, status: error.statusCode }
    }
    throw error
  }
}
