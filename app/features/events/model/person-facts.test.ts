import { describe, expect, it } from 'vitest'
import {
  describeCandidate,
  describeExternalCandidate,
  formatAbsenceRange,
  formatFactDate,
  rotationSentence,
} from './person-facts'

const TZ = 'Europe/Paris'
const entry = (date: string, assigned: boolean) => ({
  date: new Date(date).toISOString(),
  assigned,
  personName: null,
  status: 'released' as const,
})

describe('formatFactDate', () => {
  it('names the day, and the year only when it is not the reference year', () => {
    expect(formatFactDate('2026-10-22T17:00:00Z', TZ, 2026)).toBe('22 octobre')
    expect(formatFactDate('2025-08-18T17:00:00Z', TZ, 2026)).toBe('18 août 2025')
  })

  it('writes the first of the month « 1er »', () => {
    expect(formatFactDate('2026-10-01T17:00:00Z', TZ, 2026)).toBe('1er octobre')
  })

  it('reads the day in the congregation’s time zone', () => {
    expect(formatFactDate('2026-10-21T23:30:00Z', TZ, 2026)).toBe('22 octobre')
  })
})

const PARIS = 'Europe/Paris'

describe('formatAbsenceRange', () => {
  it('shares the month when both days fall in it', () => {
    expect(formatAbsenceRange('2026-11-10T00:00:00Z', '2026-11-16T00:00:00Z', PARIS, 2026)).toBe('du 10 au 16 novembre')
  })

  it('names both months when the absence crosses one', () => {
    expect(formatAbsenceRange('2026-10-28T00:00:00Z', '2026-11-03T00:00:00Z', PARIS, 2026)).toBe(
      'du 28 octobre au 3 novembre',
    )
  })

  it('gives both years when it crosses the new year', () => {
    expect(formatAbsenceRange('2026-12-28T00:00:00Z', '2027-01-03T00:00:00Z', PARIS, 2026)).toBe(
      'du 28 décembre 2026 au 3 janvier 2027',
    )
  })

  it('reads an absence saved by day in the congregation zone on its own days', () => {
    // Midnight in Paris is still the evening before in UTC.
    expect(formatAbsenceRange('2026-11-09T23:00:00Z', '2026-11-13T22:59:59.999Z', PARIS, 2026)).toBe(
      'du 10 au 13 novembre',
    )
  })

  it('says « le » for a single day', () => {
    expect(formatAbsenceRange('2026-11-12T00:00:00Z', '2026-11-12T00:00:00Z', PARIS, 2026)).toBe('le 12 novembre')
  })
})

describe('describeCandidate', () => {
  const options = { kind: 'part' as const, timeZone: TZ, referenceYear: 2026 }

  it('ranks whoever never held the slot first, then the longest since their last time', () => {
    const never = describeCandidate({}, options)
    const old = describeCandidate({ lastAssignedAt: '2025-08-18T17:00:00Z' }, options)
    const recent = describeCandidate({ lastAssignedAt: '2026-10-22T17:00:00Z' }, options)
    expect([never, old, recent].map(d => d.rank).every((rank, i, all) => i === 0 || all[i - 1] < rank)).toBe(true)
    expect([never.facts, old.facts, recent.facts]).toEqual([
      'Jamais sur cette partie',
      'La dernière le 18 août 2025',
      'La dernière le 22 octobre',
    ])
  })

  it('sets aside whoever declared an absence over the event', () => {
    const away = describeCandidate(
      { absence: { startDate: '2026-11-10T00:00:00Z', endDate: '2026-11-16T00:00:00Z' } },
      options,
    )
    expect(away).toMatchObject({
      facts: 'Absence du 10 au 16 novembre',
      tone: 'danger',
      setAside: 'Absents à cette date',
    })
  })

  it('warns about someone already at the event, keeping their history', () => {
    const busy = describeCandidate({ elsewhere: ['Sonorisation'], lastAssignedAt: '2026-10-29T17:00:00Z' }, options)
    expect(busy).toMatchObject({ facts: 'Déjà sur cet évènement · La dernière le 29 octobre', tone: 'warning' })
  })

  it('speaks of the service for a service slot', () => {
    expect(describeCandidate({}, { ...options, kind: 'service' }).facts).toBe('Jamais sur ce service')
  })
})

describe('rotationSentence', () => {
  const options = { countWarned: false, timeZone: TZ, referenceYear: 2026 }

  it('says « jamais » for someone who never held the slot', () => {
    expect(rotationSentence({ past: [entry('2026-10-01', false)], future: [], lastAssignedAt: null }, options)).toBe(
      'jamais',
    )
  })

  it('gives the date of a last time outside the occurrences shown', () => {
    expect(
      rotationSentence(
        { past: [entry('2026-10-01', false)], future: [], lastAssignedAt: '2025-08-18T17:00:00Z' },
        options,
      ),
    ).toBe('pas depuis le 18 août 2025')
  })

  it('counts the times among the occurrences shown, with their real number', () => {
    const past = [
      entry('2026-09-03', false),
      entry('2026-09-10', true),
      entry('2026-09-17', false),
      entry('2026-09-24', false),
    ]
    expect(rotationSentence({ past, future: [], lastAssignedAt: past[1].date }, options)).toBe(
      '1 des 4 dernières fois · la dernière le 10 septembre',
    )
  })

  it('leaves the count out when the rotation warning already gives it', () => {
    const past = [entry('2026-10-22', true), entry('2026-10-29', true)]
    expect(
      rotationSentence({ past, future: [], lastAssignedAt: past[1].date }, { ...options, countWarned: true }),
    ).toBe('la dernière le 29 octobre')
  })

  it('mentions a time already planned', () => {
    expect(
      rotationSentence({ past: [], future: [entry('2026-12-10T17:00:00Z', true)], lastAssignedAt: null }, options),
    ).toBe('prévu le 10 décembre')
  })
})

describe('describeExternalCandidate', () => {
  const options = { timeZone: TZ, referenceYear: 2026 }

  it('gives the congregation, then the last time on the part', () => {
    const speaker = describeExternalCandidate(
      { congregationName: 'Assemblée de Montreuil-Est', lastAssignedAt: '2026-03-14T17:00:00Z' },
      options,
    )
    expect(speaker).toMatchObject({ facts: 'Assemblée de Montreuil-Est · La dernière le 14 mars', tone: undefined })
  })

  it('warns about a record to complete', () => {
    expect(describeExternalCandidate({ congregationName: '' }, options)).toMatchObject({
      facts: 'Fiche à compléter · Jamais sur cette partie',
      tone: 'warning',
    })
  })

  it('warns about a speaker already giving another part at the event', () => {
    expect(
      describeExternalCandidate({ congregationName: 'Assemblée de Bagnolet', elsewhere: ['Discours public'] }, options),
    ).toMatchObject({
      facts: 'Assemblée de Bagnolet · Déjà sur cet évènement · Jamais sur cette partie',
      tone: 'warning',
    })
  })

  it('ranks the speakers the same way as publishers', () => {
    const never = describeExternalCandidate({ congregationName: 'A' }, options)
    const visited = describeExternalCandidate(
      { congregationName: 'A', lastAssignedAt: '2026-03-14T17:00:00Z' },
      options,
    )
    expect((never.rank ?? 0) < (visited.rank ?? 0)).toBe(true)
  })
})
