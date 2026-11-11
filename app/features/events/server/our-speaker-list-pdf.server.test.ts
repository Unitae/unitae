import { describe, expect, it } from 'vitest'
import type { OurBrother, OurSpeakerListPage } from '~/features/events/model/our-speaker.type'
import { renderPdfBuffer } from '~/shared/infra/pdf.server'
import { readPdf } from '~/tests/helpers/pdf-text'
import { buildOurSpeakerListPdf, renderOurSpeakerListPdf } from './our-speaker-list-pdf.server'

const PLAIN_PDF_NAME = /^[\w .()-]+\.pdf$/

function brother(memberId: number, name: string, extra: Partial<OurBrother> = {}): OurBrother {
  return {
    memberId,
    name,
    appointment: null,
    onList: true,
    talks: [],
    note: '',
    record: { phone: '', email: '' },
    phoneMode: 'record',
    phoneCustom: '',
    phone2: '',
    emailMode: 'record',
    emailCustom: '',
    email2: '',
    shared: { phones: [], emails: [] },
    ...extra,
  }
}

const page: OurSpeakerListPage = {
  candidatesRole: { key: 'orateurs', name: 'Orateurs publics' },
  responsibleRole: { key: 'coord-discours', name: 'Coordinateur du programme des discours publics' },
  header: {
    coordinator: { name: 'Pascal DURAND', phone: '06 11 22 33 44', email: 'p.durand@exemple.fr' },
    responsible: { name: 'Marc DUPONT', phone: '06 55 66 77 88', email: 'discours.lilas@exemple.fr' },
  },
  brothers: [
    brother(2, 'Élie MARTIN', {
      talks: [4, 26, 141],
      note: 'Pas disponible en décembre',
      shared: { phones: ['06 12 34 56 78', '01 43 62 18 40'], emails: ['elie.martin@exemple.fr'] },
    }),
    brother(3, 'Paul LEROY', { onList: false, shared: { phones: ['06 99 99 99 99'], emails: [] } }),
    brother(4, 'Jean ROUSSEAU', { talks: [12], shared: { phones: [], emails: [] } }),
    brother(5, 'Grégoire FONTAINE', {
      shared: { phones: [], emails: ['gregoire.fontaine-lambert.discours@exemple-tres-long.fr'] },
    }),
  ],
  recipients: [],
  changedAt: null,
  digest: 'sha',
}

const options = {
  congregationName: 'Saint-Étienne Nord',
  timezone: 'Europe/Paris',
  now: new Date('2026-11-11T09:00:00Z'),
}

describe('buildOurSpeakerListPdf', () => {
  it('prints the brothers on our list, with what we share of each, under the two contacts at its head', async () => {
    const { document, count } = await buildOurSpeakerListPdf(page, options)

    const [first, ...rest] = await readPdf(await renderPdfBuffer(document))
    const text = first?.text ?? ''

    expect(rest).toEqual([])
    expect(count).toBe(3)
    expect(text).toContain('Saint-Étienne Nord')
    for (const printed of [
      'Pascal DURAND',
      '06 11 22 33 44',
      'p.durand@exemple.fr',
      'Marc DUPONT',
      'discours.lilas@exemple.fr',
    ]) {
      expect(text).toContain(printed)
    }
    for (const printed of ['Élie MARTIN', '06 12 34 56 78', '01 43 62 18 40', 'elie.martin@exemple.fr', '4, 26, 141']) {
      expect(text).toContain(printed)
    }
    expect(text).toContain('Pas disponible en décembre')
    expect(text).toContain('Jean ROUSSEAU')
    // An address too long for its column is never cut with a hyphen that is not in it: it goes on two lines after « @ ».
    expect(text).toContain('gregoire.fontaine-lambert.discours@ exemple-tres-long.fr')
    // A candidate who is not ticked « Sur notre liste » is not sent.
    expect(text).not.toContain('Paul LEROY')
    expect(text).not.toContain('06 99 99 99 99')
  })

  it('leaves out a contact nobody holds, rather than printing an empty heading', async () => {
    const { document } = await buildOurSpeakerListPdf(
      { ...page, header: { coordinator: null, responsible: page.header.responsible } },
      options,
    )

    const [first] = await readPdf(await renderPdfBuffer(document))

    expect(first?.text).toContain('Marc DUPONT')
    expect(first?.text).not.toContain('Pascal DURAND')
  })

  it('names the file after the congregation and the day, in characters every mail client keeps', async () => {
    const { filename } = await buildOurSpeakerListPdf(page, options)

    expect(filename).toMatch(PLAIN_PDF_NAME)
    expect(filename).toContain('saint-etienne nord')
    expect(filename).toContain('2026-11-11')
  })

  it('is printed in the congregation’s language, whatever the language of who downloads or sends it', async () => {
    const english = await renderOurSpeakerListPdf(page, { ...options, locale: 'en' })
    const french = await renderOurSpeakerListPdf(page, { ...options, locale: 'fr' })

    expect((await readPdf(english.content))[0]?.text).toContain('Our speakers')
    expect((await readPdf(french.content))[0]?.text).toContain('Nos orateurs')
    expect(french.filename).toContain('orateurs')
  })
})
