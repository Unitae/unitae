import { describe, expect, it } from 'vitest'
import { type CurrentListSpeaker, diffSpeakerList, listChanges } from './speaker-list-diff'

function current(id: number, name: string, extra: Partial<CurrentListSpeaker> = {}): CurrentListSpeaker {
  return { id, name, phone: '', phone2: '', email: '', email2: '', talks: [], retired: false, ...extra }
}

function fields(name: string, extra: Partial<{ phone: string; email: string; talks: number[] }> = {}) {
  return { name, phone: extra.phone ?? '', phone2: '', email: extra.email ?? '', email2: '', talks: extra.talks ?? [] }
}

const here = [
  current(1, 'Paul LEROY', { phone: '06 12 34 56 78', talks: [12, 54] }),
  current(2, 'Hugo BLANC', { phone: '06 98 11 23 40', talks: [3, 45] }),
  current(3, 'Jean-Marc FAURE', { email: 'jm.faure@exemple.fr' }),
  current(4, 'Thierry MASSON', { retired: true }),
]
const elsewhere = [{ ...current(9, 'Olivier LAMBERT'), congregationName: 'Pantin' }]

describe('diffSpeakerList', () => {
  const rows = diffSpeakerList({
    current: here,
    elsewhere,
    received: [
      fields('Paul LEROY', { phone: '06.12.34.56.78', talks: [12, 54, 194] }),
      fields('hugo blanc', { phone: '06 98 11 23 40', talks: [45, 3] }),
      fields('Thierry MASSON'),
      fields('Olivier LAMBERT'),
      fields('Arnaud PICARD', { phone: '06 27 73 50 14' }),
    ],
  })
  // By the received spelling, or our name for a speaker absent from the list.
  const byName = Object.fromEntries(rows.map(row => [row.status === 'retired' ? row.fields.name : row.key, row]))

  it('matches a speaker however his name is spelled, and ignores phone punctuation and talk order', () => {
    expect(byName['hugo blanc']).toMatchObject({ status: 'unchanged', speakerId: 2 })
  })

  it('marks what changed, with the value before', () => {
    expect(byName['Paul LEROY']).toMatchObject({ status: 'changed', speakerId: 1, changed: ['talks'] })
    expect(byName['Paul LEROY']?.before?.talks).toEqual([12, 54])
  })

  it('proposes to retire a speaker absent from the new list', () => {
    expect(byName['Jean-Marc FAURE']).toMatchObject({ status: 'retired', speakerId: 3 })
  })

  it('brings back a retired speaker who is on the new list', () => {
    expect(byName['Thierry MASSON']).toMatchObject({ status: 'returning', speakerId: 4 })
  })

  it('asks about a name known in another congregation', () => {
    expect(byName['Olivier LAMBERT']).toMatchObject({
      status: 'elsewhere',
      elsewhere: { speakerId: 9, congregationName: 'Pantin' },
    })
  })

  it('adds a speaker nobody knows', () => {
    expect(byName['Arnaud PICARD']).toMatchObject({ status: 'new', speakerId: null })
  })

  it('does not list a speaker already retired and still absent', () => {
    const onlyPaul = diffSpeakerList({ current: here, elsewhere: [], received: [fields('Paul LEROY')] })
    expect(onlyPaul.map(row => row.fields.name)).not.toContain('Thierry MASSON')
  })
})

describe('listChanges', () => {
  const rows = diffSpeakerList({
    current: here,
    elsewhere,
    received: [
      fields('Paul LEROY', { talks: [12, 54, 194] }),
      fields('Hugo BLANC', { phone: '06 98 11 23 40', talks: [3, 45] }),
      fields('Thierry MASSON'),
      fields('Olivier LAMBERT'),
      fields('Arnaud PICARD'),
    ],
  })

  it('turns the rows into what to save: nothing for the unchanged, a move or a creation as answered', () => {
    const moved = listChanges(rows, { 'Olivier LAMBERT': 'move' })
    expect(moved.map(change => [change.kind, 'speakerId' in change ? change.speakerId : null])).toEqual([
      ['update', 1],
      ['update', 4],
      ['move', 9],
      ['create', null],
      ['retire', 3],
    ])
    const separate = listChanges(rows, { 'Olivier LAMBERT': 'new' })
    expect(separate.filter(change => change.kind === 'create')).toHaveLength(2)
  })

  it('leaves out a retirement the person undid', () => {
    const kept = listChanges(
      rows.map(row => (row.status === 'retired' ? { ...row, keep: true } : row)),
      {
        'Olivier LAMBERT': 'move',
      },
    )
    expect(kept.some(change => change.kind === 'retire')).toBe(false)
  })
})
