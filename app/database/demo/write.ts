import { stripDiacritics } from '../../shared/utils/strip-diacritics'
import type { PrismaClient } from '../generated/client'
import { EntranceKind, PublisherType, TerritoryAttributionKind, TerritoryKindKey } from '../generated/enums'
import type { AttributionSeed, ReportSeed, StintSeed } from './history'
import type { PersonSeed } from './people'
import type { Area } from './places'

/** Database ids of what was written, by generator key. */
export interface Written {
  members: number[]
  accounts: Map<number, number>
  territories: number[]
}

const ENTRANCE_KIND = { Residential: EntranceKind.Residential, Commerce: EntranceKind.Commerce }
const TERRITORY_KIND = { Classical: TerritoryKindKey.Classical, Commerces: TerritoryKindKey.Commerces }
const PUBLISHER_TYPE = {
  Normal: PublisherType.Normal,
  PionnierPermanant: PublisherType.PionnierPermanant,
  PionnierAuxiliaires: PublisherType.PionnierAuxiliaires,
}

/** Members, then the logins of those who have one; `inactiveAt` comes from the report history. */
export async function writePeople(
  prisma: PrismaClient,
  congregationId: number,
  people: PersonSeed[],
  inactiveAt: Map<number, Date>,
  password: string,
): Promise<Pick<Written, 'members' | 'accounts'>> {
  const rows = await prisma.member.createManyAndReturn({
    data: people.map(person => ({
      firstname: person.firstname,
      lastname: person.lastname,
      firstnameNormalized: stripDiacritics(person.firstname),
      lastnameNormalized: stripDiacritics(person.lastname),
      isMale: person.anonymized ? null : person.isMale,
      birthDate: person.birthDate,
      baptismDate: person.baptismDate,
      isPublisher: true,
      phone: person.phone,
      email: person.email,
      address: person.address,
      isHelder: person.isHelder,
      isServant: person.isServant,
      isAnointed: person.isAnointed,
      dpaCardUpToDate: person.dpaCardUpToDate,
      survivalBackpackReady: person.survivalBackpackReady,
      arrivedAt: person.arrivedAt,
      lastPastoralVisitAt: person.lastPastoralVisitAt,
      leftAt: person.leftAt,
      inactiveAt: inactiveAt.get(person.key) ?? null,
      anonymizedAt: person.anonymized ? new Date((person.leftAt as Date).getTime() + 183 * 24 * 60 * 60 * 1000) : null,
      createdAt: person.createdAt,
      congregationId,
    })),
    select: { id: true },
  })
  const members = rows.map(row => row.id)

  const withLogin = people.filter(person => person.hasAccount)
  const accountRows = await prisma.userAccount.createManyAndReturn({
    data: withLogin.map(person => ({
      memberId: members[person.key] as number,
      email: person.email,
      password,
      active: true,
      emailVerifiedAt: person.verified ? person.createdAt : null,
      createdAt: person.createdAt,
      congregationId,
    })),
    select: { id: true },
  })
  const accounts = new Map(withLogin.map((person, index) => [person.key, accountRows[index]?.id as number]))

  // Those who verified their email also accepted the data processing notice, so they land on the dashboard.
  await prisma.consentRecord.createMany({
    data: withLogin
      .filter(person => person.verified)
      .map(person => ({
        purpose: 'DATA_PROCESSING',
        consentedAt: person.createdAt,
        consentVersion: '1.0',
        userId: accounts.get(person.key) as number,
        congregationId,
      })),
  })

  await prisma.emergencyContact.createMany({
    data: people.flatMap(person =>
      person.emergencyContacts.map(contact => ({
        ...contact,
        memberId: members[person.key] as number,
        congregationId,
      })),
    ),
  })
  return { members, accounts }
}

export async function writeHistory(
  prisma: PrismaClient,
  congregationId: number,
  members: number[],
  stints: StintSeed[],
  reports: ReportSeed[],
) {
  await prisma.pioneerEnrolment.createMany({
    data: stints.map(stint => ({
      memberId: members[stint.person] as number,
      type: PUBLISHER_TYPE[stint.type],
      startMonth: stint.start.month,
      startYear: stint.start.year,
      endMonth: stint.end?.month ?? null,
      endYear: stint.end?.year ?? null,
      monthlyGoal: stint.monthlyGoal,
      congregationId,
    })),
  })
  await prisma.publisherActivity.createMany({
    data: reports.map(report => ({
      publisherId: members[report.person] as number,
      month: report.month,
      year: report.year,
      type: PUBLISHER_TYPE[report.type],
      hours: report.hours,
      studies: report.studies,
      isPublisher: report.isPublisher,
      creditHours: report.creditHours,
      congregationId,
    })),
  })
}

/**
 * Territories, buildings with their entrance, and the links between them. Entrances and buildings are written in
 * the same order, so the n-th entrance is the n-th building's. The many-to-many links go straight to Prisma's join
 * tables: `createMany` cannot connect.
 */
export async function writeArea(prisma: PrismaClient, congregationId: number, area: Area): Promise<number[]> {
  const territoryRows = await prisma.territory.createManyAndReturn({
    data: area.territories.map(territory => ({
      number: territory.number,
      type: TERRITORY_KIND[territory.type],
      congregationId,
    })),
    select: { id: true },
  })
  const territories = territoryRows.map(row => row.id)

  const buildingRows = await prisma.building.createManyAndReturn({
    data: area.buildings.map(building => ({
      number: building.number,
      street: building.street,
      streetNormalized: stripDiacritics(building.street),
      zip: building.zip,
      latitude: building.latitude,
      longitude: building.longitude,
      active: building.active,
      inTerritory: building.inTerritory,
      inOpenData: building.inOpenData,
      lastSeenInSourceAt: building.lastSeenInSourceAt,
      prospectionDate: building.prospectionDate,
      congregationId,
    })),
    select: { id: true },
  })
  const entranceRows = await prisma.buildingEntrance.createManyAndReturn({
    data: area.buildings.map(({ entrance, latitude, longitude }) => ({
      ...entrance,
      kind: ENTRANCE_KIND[entrance.kind],
      latitude,
      longitude,
      congregationId,
    })),
    select: { id: true },
  })
  const buildingIds = buildingRows.map(row => row.id)
  const entranceIds = entranceRows.map(row => row.id)
  if (buildingIds.length !== entranceIds.length) throw new Error('Buildings and entrances out of step')

  await prisma.$executeRaw`INSERT INTO "_BuildingToBuildingEntrance" ("A", "B") SELECT * FROM unnest(${buildingIds}::int[], ${entranceIds}::int[])`
  const linkEntrances = area.territories.flatMap(territory =>
    territory.buildings.map(key => entranceIds[key] as number),
  )
  const linkTerritories = area.territories.flatMap((territory, index) =>
    territory.buildings.map(() => territories[index] as number),
  )
  await prisma.$executeRaw`INSERT INTO "_BuildingEntranceToTerritory" ("A", "B") SELECT * FROM unnest(${linkEntrances}::int[], ${linkTerritories}::int[])`

  await prisma.buildingResidentialData.createMany({
    data: area.buildings
      .filter(building => building.entrance.kind === 'Residential' && building.entrance.homes != null)
      .map(building => ({
        buildingId: buildingIds[building.key] as number,
        entranceId: entranceIds[building.key] as number,
        homes: building.entrance.homes,
        phones: building.entrance.phones,
        liberals: building.entrance.liberals,
        congregationId,
      })),
  })
  await prisma.territoryPerimeter.create({ data: { paths: area.perimeter, congregationId } })
  return territories
}

export async function writeAttributions(
  prisma: PrismaClient,
  congregationId: number,
  written: Pick<Written, 'members' | 'territories'>,
  attributions: AttributionSeed[],
) {
  await prisma.attribution.createMany({
    data: attributions.map(attribution => ({
      type: TerritoryAttributionKind.Default,
      publisherId: written.members[attribution.person] as number,
      territoryId: written.territories[attribution.territory] as number,
      startDate: attribution.startDate,
      endDate: attribution.endDate,
      lateDate: attribution.lateDate,
      createdAt: attribution.startDate,
      congregationId,
    })),
  })
}
