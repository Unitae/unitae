import { describe, expect, it } from 'vitest'
import { parseSpeakerList } from './speaker-list-parse'

describe('parseSpeakerList', () => {
  it('reads a table: name, phones, e-mails and talk numbers per row, headers and titles skipped', () => {
    const parsed = parseSpeakerList([
      'ASSEMBLÉE DE BAGNOLET',
      'Liste des orateurs — novembre 2026',
      'Nom Téléphone E-mail Discours',
      'Paul LEROY 06 12 34 56 78 paul.leroy@exemple.fr 12, 54, 102, 131, 180, 194',
      'Hugo BLANC 06.98.11.23.40 3 - 45',
      'Olivier LAMBERT o.lambert@exemple.fr 27 84 158',
    ])
    expect(parsed.speakers).toEqual([
      {
        name: 'Paul LEROY',
        phone: '06 12 34 56 78',
        phone2: '',
        email: 'paul.leroy@exemple.fr',
        email2: '',
        talks: [12, 54, 102, 131, 180, 194],
      },
      { name: 'Hugo BLANC', phone: '06.98.11.23.40', phone2: '', email: '', email2: '', talks: [3, 45] },
      {
        name: 'Olivier LAMBERT',
        phone: '',
        phone2: '',
        email: 'o.lambert@exemple.fr',
        email2: '',
        talks: [27, 84, 158],
      },
    ])
  })

  it('folds a wrapped cell — a second phone or e-mail, more talks — into the row above', () => {
    const parsed = parseSpeakerList([
      'Samuel NKOMO 07 62 40 18 99 samuel.nkomo@exemple.fr 19, 61, 88,',
      '01 48 57 22 10 discours.bagnolet@exemple.fr 150, 172, 189',
    ])
    expect(parsed.speakers).toEqual([
      {
        name: 'Samuel NKOMO',
        phone: '07 62 40 18 99',
        phone2: '01 48 57 22 10',
        email: 'samuel.nkomo@exemple.fr',
        email2: 'discours.bagnolet@exemple.fr',
        talks: [19, 61, 88, 150, 172, 189],
      },
    ])
  })

  it('reads a list where a name stands alone and its details follow', () => {
    const parsed = parseSpeakerList(['Frère Arnaud PICARD', 'Tél. : +33 6 27 73 50 14 — n° 25, 64, 110'])
    expect(parsed.speakers).toEqual([
      { name: 'Arnaud PICARD', phone: '+33 6 27 73 50 14', phone2: '', email: '', email2: '', talks: [25, 64, 110] },
    ])
  })

  it('reads the coordinator and the public talk coordinator at the head of the list', () => {
    const parsed = parseSpeakerList([
      'Coordinateur : Alain BRUNET · 06 75 20 48 13 · alain.brunet@exemple.fr',
      'Responsable des discours publics : Paul LEROY · 06 12 34 56 78 · discours.bagnolet@exemple.fr',
      'Paul LEROY 06 12 34 56 78 12, 54',
    ])
    expect(parsed.contacts).toEqual({
      coordinatorName: 'Alain BRUNET',
      coordinatorPhone: '06 75 20 48 13',
      coordinatorEmail: 'alain.brunet@exemple.fr',
      responsibleName: 'Paul LEROY',
      responsiblePhone: '06 12 34 56 78',
      responsibleEmail: 'discours.bagnolet@exemple.fr',
    })
    expect(parsed.speakers.map(s => s.name)).toEqual(['Paul LEROY'])
  })

  it('keeps no more than two phones and two e-mails, as the lists carry', () => {
    const parsed = parseSpeakerList([
      'Kevin ROCHE 07 12 90 44 61 01 48 45 20 77 06 00 00 00 01 a@exemple.fr b@exemple.fr c@exemple.fr',
    ])
    expect(parsed.speakers[0]).toMatchObject({
      phone: '07 12 90 44 61',
      phone2: '01 48 45 20 77',
      email: 'a@exemple.fr',
      email2: 'b@exemple.fr',
    })
  })

  it('reads nothing from a scanned page', () => {
    expect(parseSpeakerList([])).toEqual({ contacts: {}, speakers: [] })
  })
})
