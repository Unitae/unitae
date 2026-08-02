import { PublisherType } from '~/shared/types/publisher-type'

// Built-in monthly hour goals per pioneer type, used when a congregation has not
// set a per-(service year, type) override in PioneerGoal. Stored as a monthly rate
// so proration is a plain multiplication (see pioneer-pace.ts). Special/Missionary
// are branch-set and vary widely — 100 is a placeholder admins are expected to edit.
export const DEFAULT_MONTHLY_GOALS: Record<PublisherType, number> = {
  [PublisherType.Normal]: 0,
  [PublisherType.PionnierAuxiliaires]: 30,
  [PublisherType.PionnierPermanant]: 50,
  [PublisherType.PionnierSpecial]: 100,
  [PublisherType.Missionnaire]: 100,
}

export function resolveDefaultGoal(type: PublisherType): number {
  return DEFAULT_MONTHLY_GOALS[type]
}

// A "pioneer" reports hours and carries a goal — everything except a Normal publisher.
export function isPioneerType(type: PublisherType): boolean {
  return type !== PublisherType.Normal
}

// Auxiliary pioneers re-enrol month-to-month (monthly rhythm); the others carry an
// annual commitment across the service year.
export function isAuxiliaryType(type: PublisherType): boolean {
  return type === PublisherType.PionnierAuxiliaires
}

export function isAnnualPioneerType(type: PublisherType): boolean {
  return isPioneerType(type) && !isAuxiliaryType(type)
}
