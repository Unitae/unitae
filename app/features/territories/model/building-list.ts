import { EntranceKind } from './entrance-kind.type'
import { TerritoryAccess } from './territory-access.type'

/**
 * The prospection page's views. Three are work lists, and a building sits in at most one of them, so nothing is
 * asked twice: « Manquants » (the BANO no longer lists it: does it still exist?), then « Nouveaux » (the BANO listed
 * it, nobody has prospected it), then « À vérifier » (something to redo or complete).
 */
export const BUILDING_VIEWS = ['active', 'check', 'new', 'missing', 'all'] as const
export type BuildingView = (typeof BUILDING_VIEWS)[number]
export type WorkList = 'missing' | 'new' | 'check'

export const BUILDING_SORTS = ['address', 'oldest', 'recent'] as const
export type BuildingSort = (typeof BUILDING_SORTS)[number]

/** Why a building is in « À vérifier », in the order they are shown. */
export type BuildingCheckReason =
  | 'never-prospected'
  | 'stale'
  | 'homes-missing'
  | 'phones-missing'
  | 'access-missing'
  | 'outside-territory'
  | 'reactivate'

export interface CheckDates {
  /** Prospected before this, an active building is due again. Null when the congregation sets no validity. */
  staleDate: Date | null
  /** Twice the validity: an inactive building in the territory last prospected before this may exist again. */
  inactiveStaleDate: Date | null
  /** Active but outside the territory for longer than this: someone should decide. */
  warningDate: Date
}

export interface BuildingCheckFacts {
  active: boolean
  inTerritory: boolean
  inOpenData: boolean
  lastSeenInSourceAt: Date | null
  prospectionDate: Date | null
  createdAt: Date
  entrances: {
    kind: string
    access: number | null
    homes: number | null
    phones: number | null
    isOpenEarly: boolean | null
  }[]
}

const OUTSIDE_GRACE_MONTHS = 3

export function checkDates(validityMonths: number, now = new Date()): CheckDates {
  const monthsAgo = (months: number) => {
    const date = new Date(now)
    date.setUTCMonth(date.getUTCMonth() - months)
    return date
  }
  return {
    staleDate: validityMonths > 0 ? monthsAgo(validityMonths) : null,
    inactiveStaleDate: validityMonths > 0 ? monthsAgo(validityMonths * 2) : null,
    warningDate: monthsAgo(OUTSIDE_GRACE_MONTHS),
  }
}

/** Listed by the BANO before, not by its last sync: does it still exist? Buildings made by hand never are. */
export function isMissing(b: BuildingCheckFacts): boolean {
  return b.active && !b.inOpenData && b.lastSeenInSourceAt != null
}

/** Listed by the last sync and never prospected. */
export function isNew(b: BuildingCheckFacts): boolean {
  return b.active && b.inOpenData && b.prospectionDate == null
}

/** Every reason to look at the building again. Empty for a building in « Manquants » or « Nouveaux ». */
export function buildingCheckReasons(b: BuildingCheckFacts, dates: CheckDates): BuildingCheckReason[] {
  if (isMissing(b) || isNew(b)) return []
  return [...surveyReasons(b, dates), ...entranceReasons(b), ...standingReasons(b, dates)]
}

/** Never surveyed, or surveyed too long ago. */
function surveyReasons(b: BuildingCheckFacts, dates: CheckDates): BuildingCheckReason[] {
  if (!b.active) return []
  if (b.prospectionDate == null) return b.inTerritory ? ['never-prospected'] : []
  return dates.staleDate != null && b.prospectionDate < dates.staleDate ? ['stale'] : []
}

/** What a residential entrance inside the territory still lacks. */
function entranceReasons(b: BuildingCheckFacts): BuildingCheckReason[] {
  if (!b.inTerritory) return []
  const residential = b.entrances.filter(e => e.kind === EntranceKind.Residential)
  const reasons: BuildingCheckReason[] = []
  if (residential.some(needsHomes)) reasons.push('homes-missing')
  if (residential.some(needsPhones)) reasons.push('phones-missing')
  if (residential.some(e => e.access == null && e.homes != null && e.homes > 0)) reasons.push('access-missing')
  return reasons
}

/** Active outside the territory for a while, or inactive inside it for very long: someone should decide. */
function standingReasons(b: BuildingCheckFacts, dates: CheckDates): BuildingCheckReason[] {
  if (b.active) return !b.inTerritory && b.createdAt < dates.warningDate ? ['outside-territory'] : []
  const veryOld =
    b.prospectionDate != null && dates.inactiveStaleDate != null && b.prospectionDate < dates.inactiveStaleDate
  return b.inTerritory && veryOld ? ['reactivate'] : []
}

type Entrance = BuildingCheckFacts['entrances'][number]

function needsHomes(e: Entrance): boolean {
  if (e.homes != null) return false
  return (
    e.access === TerritoryAccess.Doorbell ||
    e.access === TerritoryAccess.Intercom ||
    (e.access === TerritoryAccess.Code && e.isOpenEarly === true)
  )
}

function needsPhones(e: Entrance): boolean {
  return e.access === TerritoryAccess.Code && e.isOpenEarly === false && e.phones == null
}

export function buildingWorkList(b: BuildingCheckFacts, dates: CheckDates): WorkList | null {
  if (isMissing(b)) return 'missing'
  if (isNew(b)) return 'new'
  return buildingCheckReasons(b, dates).length > 0 ? 'check' : null
}

/** The row's shape: up to date, to prospect (never or too long ago), or not worked (inactive, outside the territory). */
export type BuildingState = 'done' | 'todo' | 'off'

export function buildingState(b: BuildingCheckFacts, dates: CheckDates): BuildingState {
  if (!b.active || !b.inTerritory) return 'off'
  if (b.prospectionDate == null) return 'todo'
  return dates.staleDate != null && b.prospectionDate < dates.staleDate ? 'todo' : 'done'
}

export function parseBuildingView(params: URLSearchParams): BuildingView {
  const view = params.get('view')
  return (BUILDING_VIEWS as readonly string[]).includes(view ?? '') ? (view as BuildingView) : 'active'
}

export function parseBuildingSort(params: URLSearchParams): BuildingSort {
  const sort = params.get('sort')
  return (BUILDING_SORTS as readonly string[]).includes(sort ?? '') ? (sort as BuildingSort) : 'address'
}
