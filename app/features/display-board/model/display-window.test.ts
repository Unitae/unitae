import { describe, expect, it } from 'vitest'
import { fromDisplayWindow, toDisplayWindow } from '~/features/display-board/model/display-window'

const timeZone = 'Europe/Paris'
const now = new Date('2026-11-09T10:00:00Z')

describe('toDisplayWindow', () => {
  it('shows from the start of the chosen day and takes it off at the end of the last, in the congregation zone', () => {
    const result = toDisplayWindow({ show: 'from', from: '2026-11-12', until: '2026-11-30' }, { timeZone, now })

    expect(result).toEqual({
      ok: true,
      window: {
        visibleFrom: new Date('2026-11-11T23:00:00.000Z'),
        visibleUntil: new Date('2026-11-30T22:59:59.999Z'),
      },
    })
  })

  it('follows summer time', () => {
    const result = toDisplayWindow({ show: 'now', from: '', until: '2027-07-14' }, { timeZone, now })

    expect(result.ok && result.window.visibleUntil).toEqual(new Date('2027-07-14T21:59:59.999Z'))
  })

  it('shows a new document from now, and never takes it off without a date', () => {
    expect(toDisplayWindow({ show: 'now', from: '', until: '' }, { timeZone, now })).toEqual({
      ok: true,
      window: { visibleFrom: now, visibleUntil: null },
    })
  })

  it('keeps the start of a document already shown, rather than moving it to the save', () => {
    const shownSince = new Date('2026-10-01T07:30:00Z')
    const result = toDisplayWindow({ show: 'now', from: '', until: '' }, { timeZone, now, current: shownSince })

    expect(result.ok && result.window.visibleFrom).toEqual(shownSince)
  })

  it('brings forward a document that was scheduled when it is now shown at once', () => {
    const scheduled = new Date('2026-12-01T00:00:00Z')
    const result = toDisplayWindow({ show: 'now', from: '', until: '' }, { timeZone, now, current: scheduled })

    expect(result.ok && result.window.visibleFrom).toEqual(now)
  })

  it('keeps a document back with « Pas encore »', () => {
    const result = toDisplayWindow({ show: 'later', from: '2026-11-12', until: '' }, { timeZone, now })

    expect(result).toEqual({ ok: true, window: { visibleFrom: null, visibleUntil: null } })
  })

  it('refuses a start day left empty, and an end before the start', () => {
    expect(toDisplayWindow({ show: 'from', from: '', until: '' }, { timeZone, now })).toEqual({
      ok: false,
      error: 'missing-from',
    })
    expect(toDisplayWindow({ show: 'from', from: '2026-11-12', until: '2026-11-11' }, { timeZone, now })).toEqual({
      ok: false,
      error: 'until-before-from',
    })
    expect(toDisplayWindow({ show: 'now', from: '', until: '2026-11-08' }, { timeZone, now })).toEqual({
      ok: false,
      error: 'until-before-from',
    })
  })
})

describe('fromDisplayWindow', () => {
  it('reads a document kept back as « Pas encore », today ready as its start', () => {
    expect(fromDisplayWindow({ visibleFrom: null, visibleUntil: null }, { timeZone, now })).toEqual({
      show: 'later',
      from: '2026-11-09',
      until: '',
    })
  })

  it('reads a document already shown as « Dès maintenant »', () => {
    const window = { visibleFrom: new Date('2026-10-01T07:30:00Z'), visibleUntil: new Date('2026-11-30T22:59:59.999Z') }

    expect(fromDisplayWindow(window, { timeZone, now })).toEqual({
      show: 'now',
      from: '2026-11-09',
      until: '2026-11-30',
    })
  })

  it('reads a scheduled document by its day in the congregation zone', () => {
    const window = { visibleFrom: new Date('2026-11-11T23:00:00Z'), visibleUntil: null }

    expect(fromDisplayWindow(window, { timeZone, now })).toEqual({ show: 'from', from: '2026-11-12', until: '' })
  })

  it('gives back the same window when saved untouched', () => {
    const window = { visibleFrom: new Date('2026-11-11T23:00:00Z'), visibleUntil: new Date('2026-11-30T22:59:59.999Z') }
    const form = fromDisplayWindow(window, { timeZone, now })

    expect(toDisplayWindow(form, { timeZone, now, current: window.visibleFrom })).toEqual({ ok: true, window })
  })
})
