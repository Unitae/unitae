import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import { addressRegex, proximityPrefix } from './address-regex'

const tokenSplit = /\s+/

// French way-types that strongly imply the query is geographic. Diacritics
// stripped so matching can run against the normalized form of the input.
const STREET_WORDS = [
  'rue',
  'avenue',
  'boulevard',
  'place',
  'chemin',
  'impasse',
  'allee',
  'cours',
  'quai',
  'route',
  'square',
  'voie',
  'pont',
] as const

export interface SearchIntent {
  // What the text-search branch should look for (always lowercased + accent
  // stripped already). Empty when the input was a forced-proximity `@` query.
  freeText: string
  // The address-like substring to ask the geocoder about, or `null` when the
  // input doesn't look geographic enough to spend an API call on.
  geoQuery: string | null
  // True when the user explicitly typed `@` — bypasses the geocode heuristic.
  forced: boolean
}

/**
 * Splits a raw search input into a text-match query and an optional geocode
 * query. Short ambiguous strings (`12`, `D012`, `pajot`) never trigger the
 * geocoder unless the user explicitly prefixed `@`.
 */
export function classifySearch(raw: string): SearchIntent {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { freeText: '', geoQuery: null, forced: false }

  if (proximityPrefix.test(trimmed)) {
    const geoQuery = trimmed.replace(proximityPrefix, '').trim()
    // `@` alone still signals forced-proximity intent so the UI can prompt
    // the user to type a place — silently treating it as empty would hide
    // the operator mode entirely.
    if (geoQuery.length === 0) return { freeText: '', geoQuery: null, forced: true }
    return { freeText: '', geoQuery, forced: true }
  }

  const normalized = stripDiacritics(trimmed)
  const tokens = normalized.split(tokenSplit).filter(Boolean)
  const hasStreetWord = tokens.some(t => STREET_WORDS.includes(t as (typeof STREET_WORDS)[number]))
  const looksLikeAddress = addressRegex.test(trimmed)

  // Heuristic: 3+ tokens, OR an explicit street word, OR a "number street"
  // shape. Anything else — particularly one- or two-token surnames and
  // single-token landmarks — stays text-only.
  const geoQuery = tokens.length >= 3 || hasStreetWord || looksLikeAddress ? trimmed : null

  return { freeText: normalized, geoQuery, forced: false }
}
