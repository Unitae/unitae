import { useMemo, useState } from 'react'
import type { ListSpeakerFields, SpeakerCongregationContacts } from '~/features/events/model/speaker-list.type'
import {
  type CurrentListSpeaker,
  changedFields,
  diffSpeakerList,
  type ElsewhereSpeaker,
  type ListRow,
  listChanges,
} from '~/features/events/model/speaker-list-diff'
import { parseSpeakerList } from '~/features/events/model/speaker-list-parse'
import { extractPdfLines } from '~/shared/ui/pdf/load-pdfjs'

// The state of the « Mettre à jour la liste » screen: the rows (the current list until a PDF is read), the contacts,
// the answers to « le même frère ? », the PDF and the list's date — and what saving them would change. Nothing counts
// as a change until the person makes one, so the save bar only appears then.

export type ReadState =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'read'; count: number }
  | { kind: 'scanned' }
  | { kind: 'error' }

const CONTACT_KEYS = [
  'responsibleName',
  'responsiblePhone',
  'responsibleEmail',
  'coordinatorName',
  'coordinatorPhone',
  'coordinatorEmail',
] as const

function startingRows(current: CurrentListSpeaker[]): ListRow[] {
  return current
    .filter(speaker => !speaker.retired)
    .map(({ id, retired: _, ...fields }) => ({
      key: `speaker-${id}`,
      status: 'unchanged' as const,
      speakerId: id,
      fields,
      before: fields,
      changed: [],
    }))
}

const emptyFields = (): ListSpeakerFields => ({ name: '', phone: '', phone2: '', email: '', email2: '', talks: [] })

export function useSpeakerListUpdate({
  current,
  elsewhere,
  contacts: initialContacts,
  listDate: recordedDate,
}: {
  current: CurrentListSpeaker[]
  elsewhere: ElsewhereSpeaker[]
  contacts: SpeakerCongregationContacts
  /** The date of the list recorded so far: a correction by hand keeps it. */
  listDate: Date | null
}) {
  const initialDate = recordedDate ? new Date(recordedDate).toISOString().slice(0, 10) : ''
  const [rows, setRows] = useState<ListRow[]>(() => startingRows(current))
  const [contacts, setContacts] = useState(initialContacts)
  const [contactsRead, setContactsRead] = useState<Set<string>>(new Set())
  const [answers, setAnswers] = useState<Record<string, 'move' | 'new'>>({})
  const [file, setFile] = useState<File | null>(null)
  const [listDate, setListDate] = useState(initialDate)
  const [read, setRead] = useState<ReadState>({ kind: 'idle' })
  const [added, setAdded] = useState(0)

  async function importPdf(next: File) {
    setFile(next)
    setRead({ kind: 'reading' })
    setListDate(new Date().toISOString().slice(0, 10))
    try {
      const parsed = parseSpeakerList(await extractPdfLines(await next.arrayBuffer()))
      if (parsed.speakers.length === 0) {
        setRead({ kind: 'scanned' })
        return
      }
      setRows(diffSpeakerList({ current, elsewhere, received: parsed.speakers }))
      setAnswers({})
      const found = CONTACT_KEYS.filter(key => (parsed.contacts[key] ?? '') !== '')
      setContacts(previous => ({ ...previous, ...Object.fromEntries(found.map(key => [key, parsed.contacts[key]])) }))
      setContactsRead(new Set(found))
      setRead({ kind: 'read', count: parsed.speakers.length })
    } catch {
      setRead({ kind: 'error' })
    }
  }

  const setField = (key: string, field: keyof ListSpeakerFields, value: string | number[]) =>
    setRows(previous =>
      previous.map(row => (row.key === key ? { ...row, fields: { ...row.fields, [field]: value } } : row)),
    )

  /** « × » retires a speaker of the list, « Annuler » keeps him; a new row simply goes. */
  const toggleRow = (key: string) =>
    setRows(previous =>
      previous.flatMap(row => {
        if (row.key !== key) return [row]
        if (row.speakerId == null) return []
        if (row.status === 'retired') return [{ ...row, keep: !row.keep }]
        return [{ ...row, status: 'retired' as const, keep: false, fields: row.before ?? row.fields }]
      }),
    )

  const addRow = () => {
    setRows(previous => [
      ...previous,
      { key: `added-${added}`, status: 'new', speakerId: null, fields: emptyFields(), before: null, changed: [] },
    ])
    setAdded(count => count + 1)
  }

  const answer = (key: string, value: 'move' | 'new') => setAnswers(previous => ({ ...previous, [key]: value }))

  const changes = useMemo(() => listChanges(rows, answers), [rows, answers])
  const contactsChanged = CONTACT_KEYS.some(key => contacts[key] !== initialContacts[key])
  const unanswered = rows.filter(row => row.status === 'elsewhere' && answers[row.key] == null).length
  const counts = {
    created: changes.filter(change => change.kind === 'create').length,
    updated: changes.filter(change => change.kind === 'update').length,
    moved: changes.filter(change => change.kind === 'move').length,
    retired: changes.filter(change => change.kind === 'retire').length,
    unanswered,
  }
  const dirty = changes.length > 0 || contactsChanged || file != null || unanswered > 0
  // Rows and contacts are only marked once a list was read: before that, nothing was compared.
  const compared = read.kind === 'read'

  /** A contact's state against what was recorded: null while nothing was compared or edited. */
  function contactState(prefix: 'responsible' | 'coordinator'): 'unchanged' | 'added' | 'changed' | null {
    const keys = CONTACT_KEYS.filter(key => key.startsWith(prefix))
    const differs = keys.some(key => contacts[key] !== initialContacts[key])
    const wasEmpty = keys.every(key => initialContacts[key] === '')
    if (differs) return wasEmpty ? 'added' : 'changed'
    return compared ? 'unchanged' : null
  }

  return {
    rows,
    compared,
    contactState,
    contacts,
    contactsRead,
    contactsChanged,
    answers,
    file,
    listDate,
    read,
    changes,
    counts,
    dirty,
    importPdf,
    setField,
    setContact: (key: keyof SpeakerCongregationContacts, value: string) =>
      setContacts(previous => ({ ...previous, [key]: value })),
    setListDate,
    toggleRow,
    addRow,
    answer,
    /** The fields of a row that differ from what we have, as the person edits them. */
    rowChanges: (row: ListRow) => (row.before ? changedFields(row.fields, row.before) : []),
    reset: () => {
      setRows(startingRows(current))
      setContacts(initialContacts)
      setContactsRead(new Set())
      setAnswers({})
      setFile(null)
      setListDate(initialDate)
      setRead({ kind: 'idle' })
    },
  }
}

export type SpeakerListUpdateState = ReturnType<typeof useSpeakerListUpdate>
