import { normalizeSpeakerName } from './speaker-congregation-name'
import type { ListSpeakerFields, SpeakerListChange } from './speaker-list.type'

// Compares a received list with the speakers we have for that congregation: who is new, who changed (and from what),
// who is absent and proposed for retirement, who comes back, and who we know under another congregation. The screen
// shows these rows next to the PDF; listChanges() turns them, as corrected, into what to save.

export interface CurrentListSpeaker extends ListSpeakerFields {
  id: number
  retired: boolean
}

export interface ElsewhereSpeaker extends CurrentListSpeaker {
  congregationName: string
}

export type ListRowStatus = 'unchanged' | 'changed' | 'new' | 'returning' | 'retired' | 'elsewhere'

export interface ListRow {
  /** Stable across edits: the received name, or `retired-<id>`. */
  key: string
  status: ListRowStatus
  speakerId: number | null
  /** What will be saved; editable. */
  fields: ListSpeakerFields
  /** What we have today, for a speaker we know. */
  before: ListSpeakerFields | null
  changed: (keyof ListSpeakerFields)[]
  /** For `elsewhere`: the speaker we know under another congregation. */
  elsewhere?: { speakerId: number; congregationName: string }
  /** For `retired`: the person kept the speaker on the list after all. */
  keep?: boolean
}

const NON_DIGITS = /\D/g
const FRENCH_PREFIX = /^33/

const phoneKey = (phone: string) => phone.replace(NON_DIGITS, '').replace(FRENCH_PREFIX, '0')
const emailKey = (email: string) => email.trim().toLowerCase()
const talksKey = (talks: number[]) => [...new Set(talks)].sort((a, b) => a - b).join(',')

const COMPARED: { field: keyof ListSpeakerFields; key: (fields: ListSpeakerFields) => string }[] = [
  { field: 'phone', key: f => phoneKey(f.phone) },
  { field: 'phone2', key: f => phoneKey(f.phone2) },
  { field: 'email', key: f => emailKey(f.email) },
  { field: 'email2', key: f => emailKey(f.email2) },
  { field: 'talks', key: f => talksKey(f.talks) },
]

/** The fields that differ, punctuation of phones, case of e-mails and order of talks aside. */
export function changedFields(fields: ListSpeakerFields, before: ListSpeakerFields): (keyof ListSpeakerFields)[] {
  const changed = COMPARED.filter(({ key }) => key(fields) !== key(before)).map(({ field }) => field)
  return fields.name.trim() !== before.name.trim() ? ['name', ...changed] : changed
}

function stored(speaker: CurrentListSpeaker): ListSpeakerFields {
  const { name, phone, phone2, email, email2, talks } = speaker
  return { name, phone, phone2, email, email2, talks }
}

export function diffSpeakerList({
  current,
  elsewhere,
  received,
}: {
  current: CurrentListSpeaker[]
  elsewhere: ElsewhereSpeaker[]
  received: ListSpeakerFields[]
}): ListRow[] {
  const here = new Map(current.map(speaker => [normalizeSpeakerName(speaker.name), speaker]))
  const away = new Map(elsewhere.map(speaker => [normalizeSpeakerName(speaker.name), speaker]))
  const matched = new Set<number>()
  const keys = new Set<string>()
  const rows: ListRow[] = []

  for (const fields of received) {
    let key = fields.name
    while (keys.has(key)) key = `${key}′`
    keys.add(key)
    const nameKey = normalizeSpeakerName(fields.name)
    const known = here.get(nameKey)
    if (known && !matched.has(known.id)) {
      matched.add(known.id)
      // The list's spelling of the name is not a change: ours stays unless the person edits it.
      const values = { ...fields, name: known.name }
      const before = stored(known)
      const changed = changedFields(values, before)
      const status = known.retired ? 'returning' : changed.length > 0 ? 'changed' : 'unchanged'
      rows.push({ key, status, speakerId: known.id, fields: values, before, changed })
      continue
    }
    const other = away.get(nameKey)
    rows.push({
      key,
      status: other ? 'elsewhere' : 'new',
      speakerId: null,
      fields,
      before: null,
      changed: [],
      ...(other ? { elsewhere: { speakerId: other.id, congregationName: other.congregationName } } : {}),
    })
  }
  for (const speaker of current) {
    if (matched.has(speaker.id) || speaker.retired) continue
    rows.push({
      key: `retired-${speaker.id}`,
      status: 'retired',
      speakerId: speaker.id,
      fields: stored(speaker),
      before: stored(speaker),
      changed: [],
    })
  }
  return rows
}

/**
 * What saving the rows does. `answers` says, per `elsewhere` row key, whether it is the same brother moving here
 * (`move`) or another one (`new`); a row not answered yet is left out. A retirement the person undid (`keep`) only
 * saves its corrections, if any.
 */
export function listChanges(rows: ListRow[], answers: Record<string, 'move' | 'new'>): SpeakerListChange[] {
  const changes: SpeakerListChange[] = []
  for (const row of rows) {
    const corrected = row.before != null && changedFields(row.fields, row.before).length > 0
    if (row.status === 'new') changes.push({ kind: 'create', fields: row.fields })
    else if (row.status === 'elsewhere' && row.elsewhere) {
      const answer = answers[row.key]
      if (answer === 'move') changes.push({ kind: 'move', speakerId: row.elsewhere.speakerId, fields: row.fields })
      else if (answer === 'new') changes.push({ kind: 'create', fields: row.fields })
    } else if (row.speakerId == null) continue
    else if (row.status === 'retired' && !row.keep) changes.push({ kind: 'retire', speakerId: row.speakerId })
    else if (row.status === 'returning' || corrected)
      changes.push({ kind: 'update', speakerId: row.speakerId, fields: row.fields })
  }
  // Retirements last, as the screen lists them.
  return [...changes.filter(c => c.kind !== 'retire'), ...changes.filter(c => c.kind === 'retire')]
}
