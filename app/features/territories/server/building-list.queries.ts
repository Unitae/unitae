import type { Prisma } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import {
  BUILDING_VIEWS,
  type BuildingCheckReason,
  type BuildingSort,
  type BuildingState,
  type BuildingView,
  buildingCheckReasons,
  buildingState,
  type CheckDates,
  checkDates,
  parseBuildingSort,
  parseBuildingView,
} from '../model/building-list'
import { EntranceKind } from '../model/entrance-kind.type'
import { TerritoryAccess } from '../model/territory-access.type'
import { computeFilters } from './building-filters.server'

// The database side of `isMissing` / `isNew` / `buildingCheckReasons` in model/building-list.ts. The two must agree:
// building-list.queries.integration.test.ts checks one building of every kind against both.
const MISSING: Prisma.BuildingWhereInput = { active: true, inOpenData: false, lastSeenInSourceAt: { not: null } }
const NEW: Prisma.BuildingWhereInput = { active: true, inOpenData: true, prospectionDate: null }

function residentialEntrance(where: Prisma.BuildingEntranceWhereInput): Prisma.BuildingWhereInput {
  return { inTerritory: true, entrances: { some: { kind: EntranceKind.Residential, ...where } } }
}

function checkWhere(dates: CheckDates): Prisma.BuildingWhereInput {
  const reasons: Prisma.BuildingWhereInput[] = [
    { active: true, inTerritory: true, prospectionDate: null },
    residentialEntrance({
      homes: null,
      OR: [
        { access: TerritoryAccess.Doorbell },
        { access: TerritoryAccess.Intercom },
        { access: TerritoryAccess.Code, isOpenEarly: true },
      ],
    }),
    residentialEntrance({ access: TerritoryAccess.Code, isOpenEarly: false, phones: null }),
    residentialEntrance({ access: null, homes: { gt: 0 } }),
    { active: true, inTerritory: false, createdAt: { lt: dates.warningDate } },
  ]
  if (dates.staleDate) reasons.push({ active: true, prospectionDate: { lt: dates.staleDate } })
  if (dates.inactiveStaleDate) {
    reasons.push({ active: false, inTerritory: true, prospectionDate: { lt: dates.inactiveStaleDate } })
  }
  return { AND: [{ NOT: MISSING }, { NOT: NEW }, { OR: reasons }] }
}

function viewWhere(view: BuildingView, dates: CheckDates): Prisma.BuildingWhereInput {
  if (view === 'active') return { active: true }
  if (view === 'check') return checkWhere(dates)
  if (view === 'new') return NEW
  if (view === 'missing') return MISSING
  return {}
}

const ROW_SELECT = {
  id: true,
  number: true,
  street: true,
  zip: true,
  latitude: true,
  longitude: true,
  active: true,
  inTerritory: true,
  inOpenData: true,
  lastSeenInSourceAt: true,
  prospectionDate: true,
  createdAt: true,
  entrances: {
    select: {
      kind: true,
      access: true,
      homes: true,
      phones: true,
      isOpenEarly: true,
      territories: { select: { id: true, number: true }, orderBy: { number: 'asc' }, take: 1 },
    },
  },
} satisfies Prisma.BuildingSelect

type SelectedBuilding = Prisma.BuildingGetPayload<{ select: typeof ROW_SELECT }>

/** What the building holds, as the « Contenu » column words it. */
export interface BuildingContent {
  homes: number
  phones: number
  /** The first residential entrance's way in; null when none is known. */
  access: number | null
  commerces: number
  hotels: number
  campuses: number
}

export interface BuildingListRow {
  id: number
  number: string
  street: string
  zip: string
  hasPosition: boolean
  active: boolean
  inTerritory: boolean
  state: BuildingState
  prospectionDate: Date | null
  createdAt: Date
  content: BuildingContent
  territory: { id: number; number: string } | null
  reasons: BuildingCheckReason[]
}

interface ListOptions {
  view: BuildingView
  params: URLSearchParams
  sort: BuildingSort
  page: number
  pageSize: number
  dates: CheckDates
  locale: string
}

/**
 * One page of a view, with the page's filters. « Adresse » orders numbers the way they are read (2 before 10) across
 * pages: the whole filtered set's keys are sorted, then only the page is loaded.
 */
export async function listBuildingPage(db: TransactionClient, congregationId: number, options: ListOptions) {
  const { view, params, sort, pageSize, dates, locale } = options
  const where: Prisma.BuildingWhereInput = { AND: [{ congregationId }, viewWhere(view, dates), computeFilters(params)] }
  const total = await db.building.count({ where })
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(1, options.page), pages)
  const skip = (page - 1) * pageSize

  const ids = await orderedIds(db, where, sort, locale, { skip, take: pageSize })

  const buildings = await db.building.findMany({ where: { id: { in: ids }, congregationId }, select: ROW_SELECT })
  const byId = new Map(buildings.map(building => [building.id, building]))
  const rows = ids.flatMap(id => {
    const building = byId.get(id)
    return building ? [toRow(building, dates)] : []
  })
  return { rows, total, page, pages, pageSize }
}

/**
 * The list's ids in its order, or one page of them. « Adresse » sorts the whole filtered set's keys in memory, so
 * numbers read the way people say them (2 before 10) across pages.
 */
async function orderedIds(
  db: TransactionClient,
  where: Prisma.BuildingWhereInput,
  sort: BuildingSort,
  locale: string,
  page?: { skip: number; take: number },
): Promise<number[]> {
  if (sort === 'address') {
    const keys = await db.building.findMany({
      where,
      select: { id: true, streetNormalized: true, number: true, zip: true },
    })
    keys.sort(
      (a, b) =>
        a.streetNormalized.localeCompare(b.streetNormalized, locale) ||
        a.number.localeCompare(b.number, locale, { numeric: true, sensitivity: 'base' }) ||
        a.zip.localeCompare(b.zip),
    )
    const ids = keys.map(key => key.id)
    return page ? ids.slice(page.skip, page.skip + page.take) : ids
  }
  const orderBy: Prisma.BuildingOrderByWithRelationInput[] =
    sort === 'oldest'
      ? [{ prospectionDate: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }]
      : [{ createdAt: 'desc' }, { id: 'desc' }]
  const found = await db.building.findMany({ where, select: { id: true }, orderBy, ...page })
  return found.map(row => row.id)
}

interface NeighbourOptions extends Omit<ListOptions, 'page' | 'pageSize'> {
  buildingId: number
}

/**
 * Where a building stands in a view, filters and order included, and the one after it: « Enregistrer et suivant »
 * walks a list without going back to it. A building no longer in the view (just surveyed, say) leads to the first.
 */
export async function findBuildingNeighbours(db: TransactionClient, congregationId: number, options: NeighbourOptions) {
  const { view, params, sort, dates, locale, buildingId } = options
  const where: Prisma.BuildingWhereInput = { AND: [{ congregationId }, viewWhere(view, dates), computeFilters(params)] }
  const ids = await orderedIds(db, where, sort, locale)
  const index = ids.indexOf(buildingId)
  return {
    position: index === -1 ? null : index + 1,
    total: ids.length,
    nextId: (index === -1 ? ids[0] : ids[index + 1]) ?? null,
  }
}

/** How many buildings each view holds, with the same filters as the list. */
export async function countBuildingViews(
  db: TransactionClient,
  congregationId: number,
  { params, dates }: { params: URLSearchParams; dates: CheckDates },
): Promise<Record<BuildingView, number>> {
  const filters = computeFilters(params)
  const counts = await Promise.all(
    BUILDING_VIEWS.map(view =>
      db.building.count({ where: { AND: [{ congregationId }, viewWhere(view, dates), filters] } }),
    ),
  )
  return Object.fromEntries(BUILDING_VIEWS.map((view, index) => [view, counts[index]])) as Record<BuildingView, number>
}

function toRow(building: SelectedBuilding, dates: CheckDates): BuildingListRow {
  const { entrances } = building
  const residential = entrances.filter(e => e.kind === EntranceKind.Residential)
  const sum = (values: (number | null)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0)
  const territory = entrances.flatMap(e => e.territories)[0] ?? null

  return {
    id: building.id,
    number: building.number,
    street: building.street,
    zip: building.zip,
    hasPosition: building.latitude != null && building.longitude != null,
    active: building.active,
    inTerritory: building.inTerritory,
    state: buildingState(building, dates),
    prospectionDate: building.prospectionDate,
    createdAt: building.createdAt,
    content: {
      homes: sum(residential.map(e => e.homes)),
      phones: sum(residential.map(e => e.phones)),
      access: residential.find(e => e.access != null)?.access ?? null,
      commerces: entrances.filter(e => e.kind === EntranceKind.Commerce).length,
      hotels: entrances.filter(e => e.kind === EntranceKind.Hotel).length,
      campuses: entrances.filter(e => e.kind === EntranceKind.Campus).length,
    },
    territory: territory ? { id: territory.id, number: territory.number } : null,
    reasons: buildingCheckReasons(building, dates),
  }
}

interface SurveyWalkOptions {
  buildingId: number
  /** The list's query string the survey was opened from, e.g. `view=check&zip=93260`. */
  from: string | null
  /** The congregation's prospection validity, in months. */
  validity: number
  locale: string
  now?: Date
}

/**
 * Where a survey opened from « À vérifier » or « Nouveaux » stands in that list, and the building after it. Null for
 * any other list, or when the survey was not opened from one.
 */
export async function findSurveyWalk(db: TransactionClient, congregationId: number, options: SurveyWalkOptions) {
  if (options.from == null) return null
  const params = new URLSearchParams(options.from)
  const view = parseBuildingView(params)
  if (view !== 'check' && view !== 'new') return null
  const neighbours = await findBuildingNeighbours(db, congregationId, {
    view,
    params,
    sort: parseBuildingSort(params),
    dates: checkDates(options.validity, options.now),
    locale: options.locale,
    buildingId: options.buildingId,
  })
  return { view, ...neighbours }
}
