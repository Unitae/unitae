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

  const text = renderShareMessage(body, {
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

  // A body whose lines all render away leaves nothing to send. Returning '' here
  // would happen to work — the caller tests truthiness — but the contract above
  // says null, and relying on the coincidence is how it stops being true.
  return text === '' ? null : text
}

export interface ShareableEventPart extends ShareablePart {
  id: number
}

export interface ShareableEvent {
  id: number
  templateId: number | null
  name: string
  startDate: Date
  eventParts: ShareableEventPart[]
}

interface ShareCongregation {
  baseUrl: string
  displayName: string
  locale: string
  timezone: string
}

/**
 * Messages for every part of an event that has one, keyed by part id.
 *
 * Lives here rather than in the route so the loader stays free of the logic,
 * and so the "one link lookup for the whole event" guarantee is testable: the
 * resolver is injected and the tests assert it is called exactly once however
 * many parts the event has.
 *
 * Parts with nothing to send are absent from the map rather than mapped to an
 * empty string, so the caller can treat presence as "show the button".
 */
export async function buildShareTextsForEvent(
  event: ShareableEvent,
  congregation: ShareCongregation,
  resolveLink: (event: { id: number; templateId: number | null }) => Promise<string>,
): Promise<Record<number, string>> {
  const link = await resolveLink({ id: event.id, templateId: event.templateId })
  const texts: Record<number, string> = {}

  for (const part of event.eventParts) {
    const text = buildAssignmentShareText({
      part,
      event,
      link,
      baseUrl: congregation.baseUrl,
      congregationName: congregation.displayName,
      locale: congregation.locale,
      timezone: congregation.timezone,
    })
    if (text) texts[part.id] = text
  }

  return texts
}
