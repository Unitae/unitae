import type { Prisma } from '~/database/generated/client'
import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import { addressRegex, proximityPrefix } from './address-regex'

export function computeFilters(params: URLSearchParams): Prisma.TerritoryWhereInput {
  let filters: Prisma.TerritoryWhereInput = {}

  filters = applyZipFilter(filters, params)
  filters = applyTypeFilter(filters, params)
  filters = applyAccessFilter(filters, params)
  filters = applySearchFilter(filters, params)

  return filters
}

function applyZipFilter(filters: Prisma.TerritoryWhereInput, params: URLSearchParams): Prisma.TerritoryWhereInput {
  if (params.has('zip') && params.get('zip') !== 'none') {
    return {
      ...filters,
      entrances: {
        some: {
          buildings: {
            ...(filters.entrances?.some?.buildings ?? {}),
            some: {
              ...(filters.entrances?.some?.buildings?.some ?? {}),
              zip: { equals: params.get('zip')?.toString() },
            },
          },
        },
      },
    }
  }

  return filters
}

function applyTypeFilter(filters: Prisma.TerritoryWhereInput, params: URLSearchParams): Prisma.TerritoryWhereInput {
  if (params.has('type') && params.get('type') !== 'none') {
    return {
      ...filters,
      type: {
        ...(typeof filters.type !== 'string' ? filters.type : {}),
        equals: params.get('type') as TerritoryKind,
      },
    }
  }

  return filters
}

function applyAccessFilter(filters: Prisma.TerritoryWhereInput, params: URLSearchParams): Prisma.TerritoryWhereInput {
  if (params.has('access') && params.get('access') !== 'none') {
    return {
      ...filters,
      entrances: {
        some: {
          ...(filters.entrances?.some ?? {}),
          access: { equals: Number(params.get('access')) },
        },
      },
    }
  }

  return filters
}

function applySearchFilter(filters: Prisma.TerritoryWhereInput, params: URLSearchParams): Prisma.TerritoryWhereInput {
  const raw = params.get('search')
  // Strip a leading `@` proximity marker so the text branch still runs even
  // when the user wanted geolocation — the loader handles geocoding/ranking;
  // here we only need to keep textual matches sensible.
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
      ...(filters.OR ?? []),
      // Territory number — case-insensitive direct match
      { number: { contains: trimmed, mode: 'insensitive' } },
      // Building street / number — match via nested entrances → buildings
      {
        entrances: {
          some: {
            buildings: {
              some:
                addressTerms == null
                  ? { streetNormalized: { contains: normalized } }
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
      // Current attributee — first/last name on the publisher Member
      {
        attributions: {
          some: {
            publisher: {
              OR: [
                { firstnameNormalized: { contains: normalized } },
                { lastnameNormalized: { contains: normalized } },
              ],
            },
          },
        },
      },
    ],
  }
}
