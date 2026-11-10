import { STREET_KINDS, STREET_NAMES } from './names'
import { TERRITORIES } from './profile'
import type { Random } from './random'

const DAY = 24 * 60 * 60 * 1000
/** East Paris: the demo's streets are invented, the place is only where the map opens. */
const CENTER = { lat: 48.858, lng: 2.395 }
const METERS_PER_DEGREE = 111_320
const ZIPS = ['75011', '75012', '75020'] as const
const STREETS_PER_AXIS = 24
const STREET_SPACING_M = 140

export type EntranceKindSeed = 'Residential' | 'Commerce'
export type TerritoryKindSeed = 'Classical' | 'Commerces'

export interface EntranceSeed {
  kind: EntranceKindSeed
  shopKind: string
  homes: number | null
  phones: number | null
  liberals: number | null
  access: number | null
  isPMR: boolean
  isOpenEarly: boolean
  isMailboxOpen: boolean
}

export interface BuildingSeed {
  key: number
  number: string
  street: string
  zip: string
  latitude: number
  longitude: number
  active: boolean
  inTerritory: boolean
  inOpenData: boolean
  prospectionDate: Date | null
  lastSeenInSourceAt: Date | null
  entrance: EntranceSeed
}

export interface TerritorySeed {
  number: string
  type: TerritoryKindSeed
  /** Keys of its buildings, one entrance each, consecutive numbers of one street. */
  buildings: number[]
}

export interface Area {
  buildings: BuildingSeed[]
  territories: TerritorySeed[]
  /** « 12 Rue des Lilas, 75011 Paris » minus the number: where people live. */
  addresses: string[]
  zips: string[]
  perimeter: { lat: number; lng: number }[]
}

interface Street {
  name: string
  zip: string
  /** Start and end, in meters from the center. */
  from: [number, number]
  to: [number, number]
  commercial: boolean
}

function toLatLng(x: number, y: number) {
  return {
    lat: CENTER.lat + y / METERS_PER_DEGREE,
    lng: CENTER.lng + x / (METERS_PER_DEGREE * Math.cos((CENTER.lat * Math.PI) / 180)),
  }
}

function zipAt(x: number, y: number): string {
  if (x < 0) return ZIPS[0]
  return y < 0 ? ZIPS[1] : ZIPS[2]
}

/** A grid of streets, each with a name of its own; a few boulevards and avenues carry the shops. */
function layStreets(random: Random): Street[] {
  const names = random.shuffle(STREET_NAMES)
  const half = (STREETS_PER_AXIS * STREET_SPACING_M) / 2
  const streets: Street[] = []
  for (let axis = 0; axis < 2; axis++) {
    for (let i = 0; i < STREETS_PER_AXIS; i++) {
      const offset = -half + i * STREET_SPACING_M + random.int(-20, 20)
      const kind = random.weighted(STREET_KINDS)
      const name = `${kind} ${names[streets.length % names.length]}`
      const from: [number, number] = axis === 0 ? [-half, offset] : [offset, -half]
      const to: [number, number] = axis === 0 ? [half, offset] : [offset, half]
      const middle: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
      streets.push({ name, zip: zipAt(...middle), from, to, commercial: kind === 'Boulevard' || kind === 'Avenue' })
    }
  }
  return streets
}

function residential(random: Random, surveyed: boolean): EntranceSeed {
  const house = random.chance(0.25)
  const homes = house ? 1 : Math.max(2, random.fromPercentiles(TERRITORIES.homesPerBuilding))
  return {
    kind: 'Residential',
    shopKind: '',
    homes,
    phones: house ? random.int(0, 1) : random.int(0, Math.ceil(homes / 4)),
    liberals: house ? 0 : random.chance(0.15) ? random.int(1, 3) : 0,
    access: surveyed ? random.weighted(TERRITORIES.access) : null,
    isPMR: random.chance(TERRITORIES.pmrRate),
    isOpenEarly: random.chance(TERRITORIES.openEarlyRate),
    isMailboxOpen: random.chance(TERRITORIES.mailboxOpenRate),
  }
}

function shop(random: Random): EntranceSeed {
  return {
    kind: 'Commerce',
    shopKind: random.weighted(TERRITORIES.shopKinds),
    homes: null,
    phones: null,
    liberals: null,
    access: null,
    isPMR: random.chance(0.3),
    isOpenEarly: random.chance(0.2),
    isMailboxOpen: false,
  }
}

/** Buildings along a street, odd numbers on one side, even on the other, in number order. */
function buildingsAlong(
  random: Random,
  now: Date,
  street: Street,
  count: number,
): Omit<BuildingSeed, 'key' | 'entrance' | 'inTerritory' | 'prospectionDate'>[] {
  const [x0, y0] = street.from
  const [x1, y1] = street.to
  const length = Math.hypot(x1 - x0, y1 - y0)
  const normal: [number, number] = [-(y1 - y0) / length, (x1 - x0) / length]
  return Array.from({ length: count }, (_, i) => {
    const t = (Math.floor(i / 2) + 0.5) / Math.ceil(count / 2)
    const side = i % 2 === 0 ? 1 : -1
    const x = x0 + (x1 - x0) * t + normal[0] * side * random.int(8, 14)
    const y = y0 + (y1 - y0) * t + normal[1] * side * random.int(8, 14)
    const { lat, lng } = toLatLng(x, y)
    const inOpenData = random.chance(0.97)
    return {
      number: String(i + 1),
      street: street.name,
      zip: street.zip,
      latitude: Math.round(lat * 1e6) / 1e6,
      longitude: Math.round(lng * 1e6) / 1e6,
      active: random.chance(0.98),
      inOpenData,
      lastSeenInSourceAt: inOpenData ? new Date(now.getTime() - random.int(1, 20) * DAY) : null,
    }
  })
}

function surveyDate(random: Random, now: Date, rate: number): Date | null {
  return random.chance(rate) ? new Date(now.getTime() - random.fromPercentiles(TERRITORIES.surveyAgeDays) * DAY) : null
}

/**
 * The demo's territory: streets in a grid, buildings along them, and the territories cut from consecutive buildings
 * of a street — door to door on ordinary streets, shops on the commercial ones. Streets not cut yet hold the free
 * entrances « Créer en lot » works on.
 */
export function generateArea(random: Random, now: Date): Area {
  const streets = random.shuffle(layStreets(random))
  const buildings: BuildingSeed[] = []
  const territories: TerritorySeed[] = []
  let classical = 0
  let commerces = 0
  let free = 0

  for (const street of streets) {
    const shopsHere = street.commercial && commerces < TERRITORIES.commerces
    const covered = shopsHere || classical < TERRITORIES.classical
    if (!covered && free >= TERRITORIES.freeEntrances) continue
    const count = random.int(50, 90)
    const placed = buildingsAlong(random, now, street, count).map((building): BuildingSeed => {
      const surveyed = covered ? random.chance(TERRITORIES.surveyedRate) : random.chance(TERRITORIES.freeSurveyedRate)
      const entrance = shopsHere ? shop(random) : residential(random, surveyed)
      return {
        ...building,
        key: buildings.length,
        inTerritory: false,
        prospectionDate: surveyed ? surveyDate(random, now, 1) : null,
        entrance,
      }
    })

    // Each placed building gets its key in order, so the chunks below can refer to them.
    for (const building of placed) {
      building.key = buildings.length
      buildings.push(building)
    }
    if (!covered) {
      free += placed.length
      continue
    }

    let index = 0
    while (index < placed.length) {
      const type: TerritoryKindSeed = shopsHere ? 'Commerces' : 'Classical'
      if (type === 'Classical' && classical >= TERRITORIES.classical) break
      if (type === 'Commerces' && commerces >= TERRITORIES.commerces) break
      const size = Math.max(
        1,
        random.fromPercentiles(shopsHere ? TERRITORIES.entrancesPerCommerces : TERRITORIES.entrancesPerClassical),
      )
      const chunk = placed.slice(index, index + size)
      index += size
      for (const building of chunk) building.inTerritory = true
      if (type === 'Classical') classical++
      else commerces++
      const number =
        type === 'Classical' ? `D${String(classical).padStart(3, '0')}` : `C${String(commerces).padStart(3, '0')}`
      territories.push({ number, type, buildings: chunk.map(building => building.key) })
    }
    free += placed.filter(building => !building.inTerritory).length
  }

  const lats = buildings.map(building => building.latitude)
  const lngs = buildings.map(building => building.longitude)
  const [south, north, west, east] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
  const margin = 0.001
  const perimeter = [
    { lat: north + margin, lng: west - margin },
    { lat: north + margin, lng: east + margin },
    { lat: south - margin, lng: east + margin },
    { lat: south - margin, lng: west - margin },
    { lat: north + margin, lng: west - margin },
  ]

  return {
    buildings,
    territories: territories.sort((a, b) => (a.number < b.number ? -1 : 1)),
    addresses: streets.map(street => `${street.name}, ${street.zip} Paris`),
    zips: [...ZIPS],
    perimeter,
  }
}
