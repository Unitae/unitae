import type { Prisma } from '~/database/generated/client'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'

/**
 * Which entrances appear on the territory edit map, as a Prisma `where` fragment.
 *
 * Visible when *either* branch holds:
 *   1. the entrance already belongs to this territory (own bypass), or
 *   2. at least one of its buildings has a prospection date **and**, for
 *      residential territories only (Classical / Phone), the content-present
 *      clause holds. Commerces / Hotel / Univ have no content clause —
 *      prospection alone is sufficient.
 *
 * Content-present matrix (residential only):
 *   Phone     ON  → phones > 0
 *   Classical ON  → homes  > 0
 *   Classical OFF → homes  > 0 OR phones > 0
 *
 * Digicode fallback: residential entrances with `homes = null` **and** an
 * access of type `Code` remain visible under any tightened rule. Entry was
 * blocked by the code, so the count is "unknown, not empty".
 */

export type MapVisibilityContext = { phoneTypeActive: boolean }

const digicodeUnknown: Prisma.BuildingEntranceWhereInput = {
  AND: [{ homes: null }, { accesses: { some: { type: TerritoryAccess.Code } } }],
}

export function contentPresentClause(
  territoryType: TerritoryKindKey,
  { phoneTypeActive }: MapVisibilityContext,
): Prisma.BuildingEntranceWhereInput | null {
  switch (territoryType) {
    case TerritoryKindKey.Commerces:
    case TerritoryKindKey.Hotel:
    case TerritoryKindKey.Univ:
      return null
    case TerritoryKindKey.Phone:
      return { OR: [{ phones: { gt: 0 } }, digicodeUnknown] }
    case TerritoryKindKey.Classical:
      return phoneTypeActive
        ? { OR: [{ homes: { gt: 0 } }, digicodeUnknown] }
        : { OR: [{ homes: { gt: 0 } }, { phones: { gt: 0 } }, digicodeUnknown] }
    default: {
      const exhaustiveCheck: never = territoryType
      throw new Error(`Unhandled TerritoryKindKey in contentPresentClause: ${String(exhaustiveCheck)}`)
    }
  }
}

export function mapVisibleWhere(
  territoryType: TerritoryKindKey,
  territoryId: number,
  ctx: MapVisibilityContext,
): Prisma.BuildingEntranceWhereInput {
  const contentClause = contentPresentClause(territoryType, ctx)
  const prospectedBranch: Prisma.BuildingEntranceWhereInput =
    contentClause == null
      ? { buildings: { some: { prospectionDate: { not: null } } } }
      : {
          AND: [{ buildings: { some: { prospectionDate: { not: null } } } }, contentClause],
        }

  return {
    OR: [{ territories: { some: { id: territoryId } } }, prospectedBranch],
  }
}

/**
 * Which entrances appear on the split-tool create map, as a Prisma `where` fragment.
 *
 * Only entrances that:
 *   1. are not already attached to a territory of the same kind, AND
 *   2. sit under at least one active building with a prospection date, AND
 *   3. satisfy the kind-specific access filter (mirrors what each split-tool
 *      tab loader has always used):
 *        Classical  → intercom, doorbell, or code
 *                     (with phoneTypeActive: code entrances must be open early)
 *        Phone      → phones > 0, or a code-locked entrance still locked in the morning
 *        Commerces  → no access filter
 *        Hotel      → no access filter
 *        Univ       → no access filter
 */
export function availableForCreateWhere(
  kind: TerritoryKindKey,
  ctx: MapVisibilityContext,
): Prisma.BuildingEntranceWhereInput {
  const notInSameKindTerritory: Prisma.BuildingEntranceWhereInput = {
    territories: { none: { type: kind } },
  }
  const prospectedAndActive: Prisma.BuildingEntranceWhereInput = {
    buildings: { some: { active: true, prospectionDate: { not: null } } },
  }
  const access = accessClauseForCreate(kind, ctx)

  return { AND: [notInSameKindTerritory, prospectedAndActive, ...(access != null ? [access] : [])] }
}

function accessClauseForCreate(
  kind: TerritoryKindKey,
  { phoneTypeActive }: MapVisibilityContext,
): Prisma.BuildingEntranceWhereInput | null {
  switch (kind) {
    case TerritoryKindKey.Classical:
      return {
        OR: [
          { access: TerritoryAccess.Intercom },
          { access: TerritoryAccess.Doorbell },
          phoneTypeActive ? { access: TerritoryAccess.Code, isOpenEarly: true } : { access: TerritoryAccess.Code },
        ],
      }
    case TerritoryKindKey.Phone:
      return {
        OR: [{ phones: { gt: 0 } }, { access: TerritoryAccess.Code, isOpenEarly: false }],
      }
    case TerritoryKindKey.Commerces:
    case TerritoryKindKey.Hotel:
    case TerritoryKindKey.Univ:
      return null
    default: {
      const exhaustiveCheck: never = kind
      throw new Error(`Unhandled TerritoryKindKey in accessClauseForCreate: ${String(exhaustiveCheck)}`)
    }
  }
}
