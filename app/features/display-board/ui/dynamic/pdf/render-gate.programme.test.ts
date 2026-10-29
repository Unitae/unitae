import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BOARD_TYPEFACES } from '~/features/display-board/model/board-appearance'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import { formatMeetingDate } from '~/features/display-board/model/programme-sheet'
import { loadBoardPdfTypeface } from '~/features/display-board/server/board-pdf-fonts.server'
import type { PdfPage } from '~/tests/helpers/pdf-text'
import { GROUP_SETS, programmeEvents, programmeNames, publisherGroups, resetPeople } from './__fixtures__/board-sheets'
import {
  countPrinted,
  expectInsideMargins,
  expectNoOverlap,
  expectPrinted,
  printedText,
  renderSheet,
} from './__fixtures__/render-sheet'

// The programme in every typeface: every meeting and every assignee printed, no duration left
// alone at the start of a line, the dotted leaders drawn — and the same sheet whatever the
// server rendered before it.

vi.setConfig({ testTimeout: 60_000 })

beforeEach(() => resetPeople())

const CONFIG = {
  templates: [
    { templateId: 1, parts: true, services: true },
    { templateId: 2, parts: true, services: true },
  ],
  groupBy: 'date' as const,
}

function programme(events = programmeEvents()) {
  return { type: DynamicType.Programme, events, config: CONFIG, showServices: true } as const
}

const DURATION_FIRST = /^\d+\s*min\b/

/** The pieces of text that open a line: a duration there was cut from its title. */
function lineStarts(pages: PdfPage[]): string[] {
  return pages.flatMap(page => {
    const lines = new Map<number, PdfPage['items']>()
    for (const item of page.items) {
      const baseline = Math.round(item.y * 2) / 2
      lines.set(baseline, [...(lines.get(baseline) ?? []), item])
    }
    return [...lines.values()].map(line => [...line].sort((a, b) => a.x - b.x)[0].str.trim())
  })
}

describe.each(BOARD_TYPEFACES)('the programme in %s', typeface => {
  it('prints every meeting once and everyone on it, the leaders drawn', async () => {
    const events = programmeEvents()

    const pages = await renderSheet(programme(events), { typeface, accent: 'wine', layout: 'list' })

    for (const event of events) expect(countPrinted(pages, formatMeetingDate(event.startDate, 'Europe/Paris'))).toBe(1)
    expectPrinted(pages, programmeNames(events))
    expect(pages.every(page => page.paths > 0)).toBe(true)
    expectInsideMargins(pages)
    expectNoOverlap(pages)
  })

  it('never starts a line with a duration', async () => {
    const pages = await renderSheet(programme(), { typeface, accent: 'wine', layout: 'list' })

    expect(lineStarts(pages).filter(start => DURATION_FIRST.test(start))).toEqual([])
    // The talk too long for one line with its speaker wraps, and keeps its duration on its title.
    expect(printedText(pages)).toContain('aujourd’hui ? » 30 min')
  })
})

describe('a sheet rendered after others in the same process', () => {
  it('prints exactly what it printed first', async () => {
    const shape = (pages: PdfPage[]) => pages.map(page => page.items.map(item => [item.str, Math.round(item.width)]))
    const appearance = { typeface: 'fira', accent: 'teal', layout: 'list' } as const

    const first = await renderSheet(programme(), appearance)
    await renderSheet(
      { type: DynamicType.PublisherGroups, groups: publisherGroups(GROUP_SETS['6x25']) },
      {
        ...appearance,
        layout: 'bands',
      },
    )
    resetPeople()
    const again = await renderSheet(programme(), appearance)

    expect(shape(again)).toEqual(shape(first))
  })
})

describe('the typefaces', () => {
  // French names, and those congregations often have from elsewhere: a typeface without one of
  // these prints it in Fira Sans, so Fira Sans must have them all.
  const NAME_CHARACTERS = 'àâäçéèêëîïôöùûüÿœæÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒÆłŁńśźżąęșțãõñễạươđ’«»  '

  it('can print every character of a name, in the typeface or in Fira Sans', async () => {
    const fira = await loadBoardPdfTypeface('fira')

    const missing = [...NAME_CHARACTERS].filter(character => fira.width(character, 'regular') === 0)

    expect(missing).toEqual([])
  })

  it('prints a name Atkinson Hyperlegible cannot set alone in full', async () => {
    const groups = publisherGroups(GROUP_SETS.demo)
    groups[0].members[0] = { ...groups[0].members[0], firstname: 'Łukasz', lastname: 'Nguyễn' }

    const pages = await renderSheet(
      { type: DynamicType.PublisherGroups, groups },
      {
        typeface: 'atkinson',
        accent: 'teal',
        layout: 'directory',
      },
    )

    expectPrinted(pages, ['Łukasz NGUYỄN'])
  })
})
