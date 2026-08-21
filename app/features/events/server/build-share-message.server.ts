import { renderShareMessage } from '~/features/events/model/share-message'
import { formatEventDate, formatEventTime } from '~/shared/utils/event-time'

interface PersonName {
  firstname: string | null
  lastname: string | null
}

export interface ShareablePart {
  name: string
  section: string
  topic: string
  note: string
  durationMin: number | null
  assignee: PersonName | null
  assistant: PersonName | null
  externalSpeaker: { name: string } | null
  preset: { shareMessage: string } | null
}

export interface BuildShareTextArgs {
  part: ShareablePart
  event: { name: string; startDate: Date }
  /** Path from resolveProgrammeLink — relative, and made absolute here. */
  link: string
  /** CongregationInfo.baseUrl: honours a custom domain or tenant subdomain. */
  baseUrl: string
  congregationName: string
  locale: string
  timezone: string
}

function fullName(person: PersonName | null): string | null {
  if (!person) return null
  return `${person.firstname ?? ''} ${person.lastname ?? ''}`.trim() || null
}

// The congregation stores a bare language code; Intl wants a BCP 47 tag.
function toIntlLocale(locale: string): string {
  return locale === 'en' ? 'en-GB' : 'fr-FR'
}

/**
 * Renders the message a programme manager sends to whoever is assigned to a
 * part, or null when there is nothing to send.
 *
 * Null rather than an empty string on purpose: the caller uses it to decide
 * whether the share button appears at all, so "no assignee", "no kind" and "a
 * kind with no wording" all collapse to the same absent-button outcome instead
 * of offering a button that would share a blank message.
 *
 * Built server-side and handed to the client ready to send. navigator.share
 * must run inside the user's click, and awaiting a fetch first spends that
 * activation — Safari then refuses with NotAllowedError.
 */
export function buildAssignmentShareText(args: BuildShareTextArgs): string | null {
  const { part, event, link, baseUrl, congregationName, locale, timezone } = args

  const body = part.preset?.shareMessage
  if (!body || body.trim() === '') return null

  // An external speaker is assigned just like a member is, and the manager has
  // as much reason to message them.
  const assignee = fullName(part.assignee) ?? part.externalSpeaker?.name ?? null
  if (!assignee) return null

  const intlLocale = toIntlLocale(locale)

  return renderShareMessage(body, {
    assignee,
    assigneeFirstname: part.assignee?.firstname ?? assignee,
    assistant: fullName(part.assistant),
    partName: part.name,
    section: part.section,
    topic: part.topic,
    duration: part.durationMin == null ? null : `${part.durationMin} min`,
    date: formatEventDate(event.startDate, timezone, intlLocale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
    time: formatEventTime(event.startDate, timezone, intlLocale),
    eventName: event.name,
    note: part.note,
    congregation: congregationName,
    // Relative on its own, and a relative path in an SMS goes nowhere.
    link: `${baseUrl}${link}`,
  })
}
