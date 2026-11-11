import type { ListSpeakerFields, SpeakerCongregationContacts } from './speaker-list.type'

// Reads the text of a received list — the lines a PDF's text layer gives, a table or a plain list alike — into
// speakers and the two contacts at its head. Best effort: whatever it gets wrong, the update screen shows next to the
// PDF for correction. Pure, so it is tested on the shapes lists actually take.

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const PHONE = /(?:\+\d{2,3}[\s.-]?(?:\(0\))?\s?[1-9]|0[1-9])(?:[\s.-]?\d{2}){4}/g
const TALK = /\b\d{1,3}\b/g
const DIGIT_OR_MARK = /[\d|]/
const LETTER = /\p{L}/u
const COORDINATOR = /coordinat/i
const RESPONSIBLE = /responsable|discours publics|public talk/i
const HEADER_WORD = /\b(?:nom|name|t[ée]l[ée]phone|phone|e-?mail|courriel|discours|talks|plans?)\b/gi
const LABEL = /\b(?:t[ée]l(?:[ée]phone)?|tel|portable|mobile|e-?mail|courriel|n[°o]s?|discours|plans?)\b\.?/gi
const COURTESY = /^(?:fr[èe]re|fr\.)\s+/i
const EDGE_PUNCTUATION = /^[\s:·•—–\-,;/()]+|[\s:·•—–\-,;/()]+$/g
const SPACES = /\s+/g

export interface ParsedSpeakerList {
  contacts: Partial<SpeakerCongregationContacts>
  speakers: ListSpeakerFields[]
}

interface LineParts {
  name: string
  phones: string[]
  emails: string[]
  talks: number[]
}

function cleanName(text: string): string {
  return text.replace(LABEL, ' ').replace(EDGE_PUNCTUATION, '').replace(SPACES, ' ').replace(COURTESY, '').trim()
}

function partsOf(line: string): LineParts {
  const emails = line.match(EMAIL) ?? []
  const withoutEmails = line.replace(EMAIL, ' | ')
  const phones = (withoutEmails.match(PHONE) ?? []).map(phone => phone.trim())
  const rest = withoutEmails.replace(PHONE, ' | ')
  const lead = cleanName(rest.split(DIGIT_OR_MARK)[0] ?? '')
  const talks = (rest.match(TALK) ?? []).map(Number).filter(talk => talk > 0)
  return { name: LETTER.test(lead) && lead.length > 1 ? lead : '', phones, emails, talks }
}

function isHeader(line: string, parts: LineParts): boolean {
  return parts.phones.length === 0 && parts.emails.length === 0 && (line.match(HEADER_WORD) ?? []).length >= 2
}

function contactOf(line: string, parts: LineParts) {
  const afterColon = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line
  const name = cleanName(afterColon.replace(EMAIL, ' | ').replace(PHONE, ' | ').split(DIGIT_OR_MARK)[0] ?? '')
  return { name, phone: parts.phones[0] ?? '', email: parts.emails[0] ?? '' }
}

function emptyRow(name: string): ListSpeakerFields {
  return { name, phone: '', phone2: '', email: '', email2: '', talks: [] }
}

/** Adds what a line gives to a row: two phones and two e-mails at most, talks each once. */
function absorb(row: ListSpeakerFields, parts: LineParts) {
  for (const phone of parts.phones) {
    if (row.phone === '') row.phone = phone
    else if (row.phone2 === '') row.phone2 = phone
  }
  for (const email of parts.emails) {
    if (row.email === '') row.email = email
    else if (row.email2 === '') row.email2 = email
  }
  row.talks = [...new Set([...row.talks, ...parts.talks])]
}

export function parseSpeakerList(lines: string[]): ParsedSpeakerList {
  const contacts: Partial<SpeakerCongregationContacts> = {}
  const speakers: ListSpeakerFields[] = []
  // A name alone on its line, waiting for the details on the next one (a list rather than a table).
  let pendingName: string | null = null
  // The row the previous line made: a line with details and no name is the rest of its wrapped cells.
  let previous: ListSpeakerFields | null = null

  for (const raw of lines) {
    const line = raw.replace(SPACES, ' ').trim()
    if (line === '') continue
    const parts = partsOf(line)
    const hasDetails = parts.phones.length > 0 || parts.emails.length > 0 || parts.talks.length > 0

    if (isHeader(line, parts)) {
      pendingName = null
      previous = null
      continue
    }
    if (line.includes(':') && (COORDINATOR.test(line) || RESPONSIBLE.test(line))) {
      const contact = contactOf(line, parts)
      const prefix = COORDINATOR.test(line) ? 'coordinator' : 'responsible'
      contacts[`${prefix}Name`] = contact.name
      contacts[`${prefix}Phone`] = contact.phone
      contacts[`${prefix}Email`] = contact.email
      pendingName = null
      previous = null
      continue
    }
    if (parts.name !== '' && hasDetails) {
      const row = emptyRow(parts.name)
      absorb(row, parts)
      speakers.push(row)
      previous = row
      pendingName = null
    } else if (parts.name !== '') {
      // A title, or a name whose details follow: decided by the next line.
      pendingName = parts.name
      previous = null
    } else if (hasDetails && pendingName != null) {
      const row = emptyRow(pendingName)
      absorb(row, parts)
      speakers.push(row)
      previous = row
      pendingName = null
    } else if (hasDetails && previous != null) {
      absorb(previous, parts)
    }
  }
  return { contacts, speakers }
}
