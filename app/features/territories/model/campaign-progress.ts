import { addDays } from '~/shared/utils/calendar-day'

import type { CampaignStatus } from './campaign-status'

export type StepState = 'done' | 'now' | 'next'

/** The steps of a campaign's timeline, each done, under way or to come. */
export interface CampaignSteps {
  start: StepState
  during: StepState
  end: StepState
  rest: StepState
}

/**
 * Where a campaign stands on its timeline. After it ends, its territories rest `restDays` from the day after its last
 * one, the day the territories still out come back.
 */
export function campaignStepStates(
  status: CampaignStatus,
  { today, endDay, restDays }: { today: string; endDay: string; restDays: number },
): CampaignSteps {
  if (status === 'scheduled') return { start: 'next', during: 'next', end: 'next', rest: 'next' }
  if (status === 'active') return { start: 'done', during: 'now', end: 'next', rest: 'next' }
  const restsUntil = addDays(endDay, restDays)
  return { start: 'done', during: 'done', end: 'done', rest: today <= restsUntil ? 'now' : 'done' }
}

export type TileState = 'back' | 'out' | 'todo'

/**
 * Each territory of a campaign's scope as the page draws it: out while one of the campaign's attributions of it is
 * open, returned once they all are, not attributed yet otherwise.
 */
export function scopeTiles<T extends { id: number; number: string }>(
  territories: T[],
  attributions: { territory: { id: number }; endDate: Date | string | null }[],
): (Pick<T, 'id' | 'number'> & { state: TileState })[] {
  const out = new Set(attributions.filter(row => row.endDate == null).map(row => row.territory.id))
  const back = new Set(attributions.filter(row => row.endDate != null).map(row => row.territory.id))
  return territories.map(territory => ({
    id: territory.id,
    number: territory.number,
    state: out.has(territory.id) ? 'out' : back.has(territory.id) ? 'back' : 'todo',
  }))
}
