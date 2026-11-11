import { getLocale } from '~/i18n/paraglide/runtime'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import type { DirectoryCongregation, DirectorySpeaker, SpeakerDirectory } from './external-speaker.type'
import { normalizeSpeakerName } from './speaker-congregation-name'

// How the external-speakers page arranges the directory: speakers grouped under their congregation, filtered by the
// quick view and the search, sorted as chosen. Pure, so the page re-arranges without asking the server.

export type SpeakerView = 'list' | 'retired'
export type SpeakerSort = 'name' | 'last-visit' | 'next-visit'

/** The list's filters, kept in the address: each one narrows the list, together they combine. */
export interface SpeakerFilters {
  record?: 'incomplete'
  list?: 'stale'
  visits?: 'never' | 'soon'
}

export interface SpeakerGroup {
  /** Null for the speakers without a congregation (the legacy « à compléter » ones). */
  congregation: DirectoryCongregation | null
  speakers: DirectorySpeaker[]
}

const DAY_MS = 24 * 60 * 60 * 1000
const YEAR_MS = 365 * DAY_MS
const SOON_MS = 31 * DAY_MS
const TALK_NUMBER = /^\d+$/

/** A list received over a year ago: probably out of date. */
export function isListStale(listDate: Date | null, now: Date = new Date()): boolean {
  return listDate != null && now.getTime() - listDate.getTime() > YEAR_MS
}

/** A record to complete: no congregation, or nobody to reach (the legacy records from the old free-text field). */
export function isIncomplete(speaker: DirectorySpeaker): boolean {
  return (
    speaker.speakerCongregationId == null ||
    ![speaker.phone, speaker.phone2, speaker.email, speaker.email2].some(Boolean)
  )
}

/** The speaker is his congregation's public talk coordinator, however the name is spelled on its list. */
export function isResponsible(speaker: DirectorySpeaker, congregation: DirectoryCongregation | null): boolean {
  return (
    congregation != null &&
    congregation.responsibleName !== '' &&
    normalizeSpeakerName(congregation.responsibleName) === normalizeSpeakerName(speaker.name)
  )
}

function passes(
  speaker: DirectorySpeaker,
  congregation: DirectoryCongregation | undefined,
  filters: SpeakerFilters,
  now: Date,
): boolean {
  if (filters.record === 'incomplete' && !isIncomplete(speaker)) return false
  if (filters.list === 'stale' && !isListStale(congregation?.listDate ?? null, now)) return false
  if (filters.visits === 'never' && speaker.lastVisit != null) return false
  if (filters.visits === 'soon') {
    const next = speaker.nextVisit?.date.getTime()
    if (next == null || next - now.getTime() > SOON_MS) return false
  }
  return true
}

function matches(speaker: DirectorySpeaker, congregation: DirectoryCongregation | undefined, query: string): boolean {
  if (query === '') return true
  const key = stripDiacritics(query.trim())
  if (TALK_NUMBER.test(key)) return speaker.talks.includes(Number(key))
  return [speaker.name, congregation?.name ?? speaker.legacyCongregationName ?? ''].some(text =>
    stripDiacritics(text).includes(key),
  )
}

const time = (date: Date | null | undefined, missing: number) => date?.getTime() ?? missing

function comparator(sort: SpeakerSort): (a: DirectorySpeaker, b: DirectorySpeaker) => number {
  const locale = getLocale()
  const byName = (a: DirectorySpeaker, b: DirectorySpeaker) => a.name.localeCompare(b.name, locale)
  if (sort === 'last-visit') {
    // Never came first: the order a planner rotates through.
    const last = (s: DirectorySpeaker) => time(s.lastVisit, Number.NEGATIVE_INFINITY)
    return (a, b) => last(a) - last(b) || byName(a, b)
  }
  if (sort === 'next-visit') {
    const next = (s: DirectorySpeaker) => time(s.nextVisit?.date, Number.POSITIVE_INFINITY)
    return (a, b) => (next(a) === next(b) ? byName(a, b) : next(a) < next(b) ? -1 : 1)
  }
  return byName
}

export function buildSpeakerGroups(
  directory: SpeakerDirectory,
  options: { view: SpeakerView; query: string; sort: SpeakerSort; filters: SpeakerFilters },
  now: Date = new Date(),
): SpeakerGroup[] {
  const congregations = new Map(directory.congregations.map(c => [c.id, c]))
  const shown = directory.speakers.filter(s => {
    const congregation = s.speakerCongregationId == null ? undefined : congregations.get(s.speakerCongregationId)
    return (
      (options.view === 'retired') === (s.retiredAt != null) &&
      matches(s, congregation, options.query) &&
      passes(s, congregation, options.filters, now)
    )
  })
  const narrowed = options.query.trim() !== '' || Object.values(options.filters).some(value => value != null)
  const order = comparator(options.sort)
  const groups: SpeakerGroup[] = directory.congregations
    .map(congregation => ({
      congregation,
      speakers: shown.filter(s => s.speakerCongregationId === congregation.id).sort(order),
    }))
    // A congregation with nobody on its list yet still shows, so its name opens it — unless a search or filter is on.
    .filter(group => group.speakers.length > 0 || (options.view === 'list' && !narrowed))
  const unassigned = shown.filter(s => s.speakerCongregationId == null || !congregations.has(s.speakerCongregationId))
  if (unassigned.length > 0) groups.push({ congregation: null, speakers: unassigned.sort(order) })
  return groups
}

export function speakerCounts(directory: SpeakerDirectory) {
  const onList = directory.speakers.filter(s => s.retiredAt == null)
  return {
    onList: onList.length,
    retired: directory.speakers.length - onList.length,
    congregations: directory.congregations.length,
  }
}
