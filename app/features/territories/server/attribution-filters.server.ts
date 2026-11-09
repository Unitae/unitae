import type { Prisma } from '~/database/generated/client'
import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import { addressRegex, proximityPrefix } from './address-regex'

/** A positive whole number from the address, or null: anything else never reaches the query. */
function idParam(value: string | null): number | null {
  const id = Number(value)
  return value != null && Number.isInteger(id) && id > 0 ? id : null
}

/**
 * The filters of the attributions list that narrow the query: the publisher's group, the method, the campaign and the
 * search. The state (late, paused, without a holder) is the page's quick views, worked out per row.
 */
export function computeFilters(params: URLSearchParams): Prisma.AttributionWhereInput {
  let filters: Prisma.AttributionWhereInput = {}

  filters = applyGroupFilter(filters, params)
  filters = applyTypeFilter(filters, params)
  filters = applyCampaignFilter(filters, params)
  filters = applySearchFilter(filters, params)

  return filters
}

function applyGroupFilter(
  filters: Prisma.AttributionWhereInput,
  params: URLSearchParams,
): Prisma.AttributionWhereInput {
  const group = idParam(params.get('group'))
  if (group == null) return filters
  return { ...filters, publisher: { publisherGroupId: { equals: group } } }
}

function applyTypeFilter(filters: Prisma.AttributionWhereInput, params: URLSearchParams): Prisma.AttributionWhereInput {
  if (params.has('type') && params.get('type') !== 'none') {
    return { ...filters, type: { equals: params.get('type') as TerritoryAttributionKind } }
  }

  return filters
}

function applyCampaignFilter(
  filters: Prisma.AttributionWhereInput,
  params: URLSearchParams,
): Prisma.AttributionWhereInput {
  const value = params.get('campaign')
  if (value == null || value === 'none') return filters
  if (value === 'any') return { ...filters, campaignId: { not: null } }
  if (value === 'outside') return { ...filters, campaignId: null }
  const campaign = idParam(value)
  return campaign == null ? filters : { ...filters, campaignId: { equals: campaign } }
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
          OR: [{ firstnameNormalized: { contains: normalized } }, { lastnameNormalized: { contains: normalized } }],
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
