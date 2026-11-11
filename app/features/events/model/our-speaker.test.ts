import { describe, expect, it } from 'vitest'
import { ourListContent, readerView, sendState, sharedContact } from './our-speaker'
import type { OurBrother, OurSpeakerListPage } from './our-speaker.type'

const record = { phone: '06 11 22 33 44', email: 'marc.dupont@exemple.fr' }
const entry = {
  phoneMode: 'record' as const,
  phoneCustom: '',
  phone2: '',
  emailMode: 'record' as const,
  emailCustom: '',
  email2: '',
}

describe('sharedContact', () => {
  it('follows his record by default', () => {
    expect(sharedContact(entry, record)).toEqual({ phones: ['06 11 22 33 44'], emails: ['marc.dupont@exemple.fr'] })
  })

  it('replaces a line with another value, adds the seconds, or leaves a line out', () => {
    expect(
      sharedContact(
        {
          ...entry,
          emailMode: 'custom',
          emailCustom: 'discours.lilas@exemple.fr',
          email2: 'marc.dupont@exemple.fr',
          phoneMode: 'hidden',
        },
        record,
      ),
    ).toEqual({ phones: [], emails: ['discours.lilas@exemple.fr', 'marc.dupont@exemple.fr'] })
  })

  it('keeps a second phone even when the first is left out, and never repeats a value', () => {
    expect(
      sharedContact(
        { ...entry, phoneMode: 'hidden', phone2: '01 43 62 18 40', email2: 'marc.dupont@exemple.fr' },
        record,
      ),
    ).toEqual({
      phones: ['01 43 62 18 40'],
      emails: ['marc.dupont@exemple.fr'],
    })
  })

  it('shares nothing from an empty record line', () => {
    expect(sharedContact(entry, { phone: '', email: '' })).toEqual({ phones: [], emails: [] })
  })
})

describe('sendState', () => {
  const at = new Date('2026-10-03')

  it('says where our list stands with a congregation: never sent, sent and changed since, or up to date', () => {
    expect(sendState({ sentAt: null, outdated: true })).toBe('never')
    expect(sendState({ sentAt: at, outdated: true })).toBe('changed')
    expect(sendState({ sentAt: at, outdated: false })).toBe('up-to-date')
  })
})

function brother(memberId: number, name: string, extra: Partial<OurBrother> = {}): OurBrother {
  return {
    memberId,
    name,
    appointment: 'elder',
    onList: true,
    talks: [4, 26],
    note: '',
    record,
    ...entry,
    shared: { phones: [record.phone], emails: [record.email] },
    ...extra,
  }
}

const head: OurSpeakerListPage['header'] = {
  coordinator: { name: 'Pascal DURAND', phone: '06 21 54 87 10', email: 'pascal.durand@exemple.fr' },
  responsible: { name: 'Marc DUPONT', phone: '06 11 22 33 44', email: 'discours.lilas@exemple.fr' },
}
const marc = brother(2, 'Marc DUPONT')
const paul = brother(3, 'Paul MARTIN', { onList: false })

describe('ourListContent', () => {
  const content = (brothers: OurBrother[], header = head) => ourListContent({ header, brothers })

  it('changes with what the other congregations read: a brother added or gone, a talk, a shared number, the head', () => {
    const before = content([marc, paul])

    expect(content([marc, { ...paul, onList: true }])).not.toBe(before)
    expect(content([paul])).not.toBe(before)
    expect(content([{ ...marc, talks: [4, 26, 141] }, paul])).not.toBe(before)
    expect(content([{ ...marc, shared: { phones: ['07 00 00 00 00'], emails: [] } }, paul])).not.toBe(before)
    expect(content([marc, paul], { ...head, coordinator: null })).not.toBe(before)
  })

  it('ignores what does not go out: a candidate left off the list, a record line that is not shared', () => {
    const before = content([marc, paul])

    expect(content([marc, { ...paul, talks: [1, 2, 3], shared: { phones: ['07'], emails: [] } }])).toBe(before)
    expect(content([{ ...marc, record: { phone: '01 00 00 00 00', email: marc.record.email } }, paul])).toBe(before)
  })
})

describe('readerView', () => {
  const page: OurSpeakerListPage = {
    candidatesRole: { key: 'orateurs', name: 'Orateurs publics' },
    responsibleRole: null,
    header: head,
    brothers: [
      brother(2, 'Marc DUPONT', {
        phoneMode: 'hidden',
        emailMode: 'custom',
        emailCustom: 'discours.lilas@exemple.fr',
        phoneCustom: '07 99 99 99 99',
        shared: { phones: [], emails: ['discours.lilas@exemple.fr'] },
      }),
      paul,
    ],
    recipients: [],
    changedAt: null,
    digest: 'sha',
  }

  it('shows a reader the brothers on the list, with what goes out of each and nothing else of his record', () => {
    const view = readerView(page)

    expect(view.brothers.map(each => each.name)).toEqual(['Marc DUPONT'])
    expect(view.brothers[0]).toMatchObject({
      // His phone is not shared, his record's e-mail is replaced: neither leaves the server.
      record: { phone: '', email: '' },
      phoneCustom: '',
      emailCustom: 'discours.lilas@exemple.fr',
      shared: { phones: [], emails: ['discours.lilas@exemple.fr'] },
    })
  })

  it('keeps a record line that is the one shared', () => {
    const view = readerView({ ...page, brothers: [marc] })

    expect(view.brothers[0]?.record).toEqual(record)
  })
})
