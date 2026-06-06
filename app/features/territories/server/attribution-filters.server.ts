import type { Prisma } from '~/database/generated/client'
import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import { addressRegex, proximityPrefix } from './address-regex'

export function computeFilters(params: URLSearchParams): Prisma.AttributionWhereInput {
  let filters: Prisma.AttributionWhereInput = {}

  filters = applyGroupFilter(filters, params)
  filters = applyTypeFilter(filters, params)
  filters = applyStatusFilter(filters, params)
  filters = applySearchFilter(filters, params)

  return filters
}

function applyGroupFilter(
  filters: Prisma.AttributionWhereInput,
  params: URLSearchParams,
): Prisma.AttributionWhereInput {
  if (params.has('group') && params.get('group') !== 'none') {
    return {
      ...filters,
      publisher: {
        publisherGroupId: { equals: Number(params.get('group')) },
      },
    }
  }

  return filters
}

function applyTypeFilter(filters: Prisma.AttributionWhereInput, params: URLSearchParams): Prisma.AttributionWhereInput {
  if (params.has('type') && params.get('type') !== 'none') {
    return { ...filters, type: { equals: params.get('type') as TerritoryAttributionKind } }
  }

  return filters
}

function applyStatusFilter(
  filters: Prisma.AttributionWhereInput,
  params: URLSearchParams,
): Prisma.AttributionWhereInput {
  if (params.has('status') && params.get('status') !== 'none') {
    if (params.get('status') === 'orphaned') {
      // Publisher has left the congregation or has been anonymized — the
      // attribution still points at them but the territory needs reassigning.
      return {
        ...filters,
        publisher: {
          ...((filters.publisher as Prisma.MemberWhereInput | undefined) ?? {}),
          OR: [{ leftAt: { not: null } }, { anonymizedAt: { not: null } }],
        },
      }
    }
    if (params.get('status') === 'late') {
      return { ...filters, lateDate: { lt: new Date() } }
    }

    return { ...filters, lateDate: { gt: new Date() } }
  }

  return filters
}

function applySearchFilter(
  filters: Prisma.AttributionWhereInput,
  params: URLSearchParams,
): Prisma.AttributionWhereInput {
  const raw = params.get('search')
  const trimmed = raw?.replace(proximityPrefix, '').trim() ?? ''
  if (trimmed.length === 0) return filters

  const normalized = stripDiacritics(trimmed)
  const addressTerms = trimmed.match(addressRegex)
  const addressNumber = addressTerms?.[1]
  const addressStreet = addressTerms?.[3]
  const addressStreetNormalized = addressStreet != null ? stripDiacritics(addressStreet) : null

  return {
    ...filters,
    OR: [
      {
        publisher: {
          OR: [
            { firstnameNormalized: { contains: normalized } },
            { lastnameNormalized: { contains: normalized } },
          ],
        },
      },
      { territory: { number: { contains: trimmed, mode: 'insensitive' } } },
      {
        territory: {
          entrances: {
            some: {
              buildings: {
                some:
                  addressTerms == null
                    ? {
                        OR: [
                          { streetNormalized: { contains: normalized } },
                          { number: { contains: trimmed, mode: 'insensitive' } },
                          { zip: { contains: trimmed, mode: 'insensitive' } },
                        ],
                      }
                    : {
                        AND: [
                          { number: { contains: addressNumber, mode: 'insensitive' } },
                          { streetNormalized: { contains: addressStreetNormalized ?? normalized } },
                        ],
                      },
              },
            },
          },
        },
      },
    ],
  }
}
