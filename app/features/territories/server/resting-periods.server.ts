export const RESTING_PERIOD_FOR_DOORS_TO_DOORS = 90 * 24 * 60 * 60 * 1000 // 90 days
export const RESTING_PERIOD_FOR_CAMPAIGN = 15 * 24 * 60 * 60 * 1000 // 15 days
export const RESTING_PERIOD_FOR_PHONE = 15 * 24 * 60 * 60 * 1000 // 15 days

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
