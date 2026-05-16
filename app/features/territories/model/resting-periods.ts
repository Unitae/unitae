const MS_PER_DAY = 24 * 60 * 60 * 1000

// Single source of truth — day counts surfaced via tooltips and SQL helpers.
export const RESTING_PERIOD_DAYS = {
  doorsToDoors: 90,
  campaign: 15,
  phone: 15,
} as const

export const RESTING_PERIOD_FOR_DOORS_TO_DOORS = RESTING_PERIOD_DAYS.doorsToDoors * MS_PER_DAY
export const RESTING_PERIOD_FOR_CAMPAIGN = RESTING_PERIOD_DAYS.campaign * MS_PER_DAY
export const RESTING_PERIOD_FOR_PHONE = RESTING_PERIOD_DAYS.phone * MS_PER_DAY

export interface RestPeriodCutoffs {
  doorsToDoors: Date
  campaign: Date
  phone: Date
}

// For each attribution kind, returns the cutoff Date such that an attribution
// whose endDate is AFTER the cutoff is still inside its rest window.
// Injecting `reference` makes tests deterministic without faking the system clock.
export function getRestPeriodCutoffs(reference: Date = new Date()): RestPeriodCutoffs {
  const refMs = reference.getTime()
  return {
    doorsToDoors: new Date(refMs - RESTING_PERIOD_FOR_DOORS_TO_DOORS),
    campaign: new Date(refMs - RESTING_PERIOD_FOR_CAMPAIGN),
    phone: new Date(refMs - RESTING_PERIOD_FOR_PHONE),
  }
}
