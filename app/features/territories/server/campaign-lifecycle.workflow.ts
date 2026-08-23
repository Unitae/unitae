import type { Campaign } from '~/database/generated/client'
import {
  CampaignRegularEndAction,
  CampaignRegularStartAction,
} from '~/features/territories/model/campaign-lifecycle.type'
import { getCampaignStatus } from '~/features/territories/model/campaign-status'
import { ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import * as attributionAggregate from './attribution.aggregate'
import * as pauseAggregate from './attribution-pause.aggregate'
import * as campaignAggregate from './campaign.aggregate'
import { listAllTerritoryIds } from './campaign.queries'

export type CampaignWithScope = Campaign & { scope: { territoryId: number }[] }

function localDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function scopeTerritoryIds(campaign: CampaignWithScope): number[] | null {
  return campaign.scope.length > 0 ? campaign.scope.map(s => s.territoryId) : null
}

/**
 * Campaign start transition. Stamps `activatedAt` FIRST — campaign mode is on
 * (and the sweep's idempotency guard set) before any attribution moves; the
 * stamp is also what lets `startAutoReassign` create campaign attributions
 * through the regular `assign` guard.
 */
export async function activateCampaign(
  db: TransactionClient,
  campaign: CampaignWithScope,
  congregationId: number,
  actorId: number,
  now: Date = new Date(),
) {
  if (campaign.activatedAt != null) return { activated: false, paused: 0, closed: 0, reassigned: 0 }

  await campaignAggregate.markActivated(db, campaign.id, congregationId, actorId, now)

  const territoryIds = scopeTerritoryIds(campaign)
  const transition = { congregationId, campaignId: campaign.id, territoryIds, actorId, now }

  let paused = 0
  let closed = 0
  let reassigned = 0
  if (campaign.startRegularAction === CampaignRegularStartAction.Pause) {
    const pausedRows = await pauseAggregate.pauseOpenRegulars(db, transition)
    paused = pausedRows.length
    if (campaign.startAutoReassign) {
      reassigned = await _reassignIntoCampaign(db, campaign, pausedRows, congregationId, actorId, now)
    }
  } else if (campaign.startRegularAction === CampaignRegularStartAction.Close) {
    closed = await pauseAggregate.closeOpenRegulars(db, transition)
  }
  // Leave: regular and campaign work coexist — nothing to do.

  return { activated: true, paused, closed, reassigned }
}

async function _reassignIntoCampaign(
  db: TransactionClient,
  campaign: CampaignWithScope,
  rows: { publisherId: number; territoryId: number }[],
  congregationId: number,
  actorId: number,
  now: Date,
): Promise<number> {
  let reassigned = 0
  for (const row of rows) {
    try {
      await attributionAggregate.assign(db, {
        publisherId: row.publisherId,
        territoryId: row.territoryId,
        startDate: localDateString(now),
        notes: '',
        type: 'Default',
        campaignId: campaign.id,
        congregationId,
        actorId,
      })
      reassigned++
    } catch (err) {
      // Same pair already holds an attribution in this campaign — the
      // re-run of a partially applied activation. Skip, don't fail the sweep.
      if (!(err instanceof ConflictError)) throw err
    }
  }
  return reassigned
}

/**
 * Campaign end transition. Stamps `endedAt` FIRST (mode off, guard set), then
 * applies the configured cleanup. `endRegularAction` only ever touches rows
 * with `pausedByCampaignId = campaign.id`.
 */
export async function endCampaign(
  db: TransactionClient,
  campaign: CampaignWithScope,
  congregationId: number,
  actorId: number,
  now: Date = new Date(),
) {
  if (campaign.endedAt != null || campaign.activatedAt == null) {
    return { ended: false, closedCampaign: 0, resumed: 0, closedRegulars: 0 }
  }

  await campaignAggregate.markEnded(db, campaign.id, congregationId, actorId, now)

  const transition = { congregationId, campaignId: campaign.id, territoryIds: null, actorId, now }

  let closedCampaign = 0
  let resumed = 0
  let closedRegulars = 0
  if (campaign.endCloseCampaign) {
    closedCampaign = await pauseAggregate.closeOpenCampaignAttributions(db, transition)
  }
  if (campaign.endRegularAction === CampaignRegularEndAction.Resume) {
    resumed = await pauseAggregate.resumePausedBy(db, transition)
  } else if (campaign.endRegularAction === CampaignRegularEndAction.Close) {
    closedRegulars = await pauseAggregate.closePausedBy(db, transition)
  }
  // KeepPaused: released later by the manual resume action.

  return { ended: true, closedCampaign, resumed, closedRegulars }
}

/**
 * Scope edit. For a non-active campaign this is a plain replacement; for an
 * active one, territories entering the scope get the start transition and
 * territories leaving it get the end transition (an empty scope counts as
 * every territory on both sides of the diff).
 */
export async function applyScopeChange(
  db: TransactionClient,
  campaign: CampaignWithScope,
  nextTerritoryIds: number[],
  congregationId: number,
  actorId: number,
  now: Date = new Date(),
) {
  if (getCampaignStatus(campaign) !== 'active') {
    await campaignAggregate.replaceScope(db, campaign.id, congregationId, nextTerritoryIds)
    return { added: 0, removed: 0 }
  }

  const currentIds = campaign.scope.map(s => s.territoryId)
  const allIds =
    currentIds.length === 0 || nextTerritoryIds.length === 0 ? await listAllTerritoryIds(db, congregationId) : []
  const effectiveCurrent = currentIds.length > 0 ? currentIds : allIds
  const effectiveNext = nextTerritoryIds.length > 0 ? nextTerritoryIds : allIds

  const added = effectiveNext.filter(id => !effectiveCurrent.includes(id))
  const removed = effectiveCurrent.filter(id => !effectiveNext.includes(id))

  if (added.length > 0) {
    const transition = { congregationId, campaignId: campaign.id, territoryIds: added, actorId, now }
    if (campaign.startRegularAction === CampaignRegularStartAction.Pause) {
      const pausedRows = await pauseAggregate.pauseOpenRegulars(db, transition)
      if (campaign.startAutoReassign) {
        await _reassignIntoCampaign(db, campaign, pausedRows, congregationId, actorId, now)
      }
    } else if (campaign.startRegularAction === CampaignRegularStartAction.Close) {
      await pauseAggregate.closeOpenRegulars(db, transition)
    }
  }

  if (removed.length > 0) {
    const transition = { congregationId, campaignId: campaign.id, territoryIds: removed, actorId, now }
    if (campaign.endCloseCampaign) {
      await pauseAggregate.closeOpenCampaignAttributions(db, transition)
    }
    if (campaign.endRegularAction === CampaignRegularEndAction.Resume) {
      await pauseAggregate.resumePausedBy(db, transition)
    } else if (campaign.endRegularAction === CampaignRegularEndAction.Close) {
      await pauseAggregate.closePausedBy(db, transition)
    }
  }

  await campaignAggregate.replaceScope(db, campaign.id, congregationId, nextTerritoryIds)
  return { added: added.length, removed: removed.length }
}
