import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BOARD_LAYOUTS, BOARD_TYPEFACES } from '~/features/display-board/model/board-appearance'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import { fitGroupsSheet, type SheetPublisherGroup } from '~/features/display-board/model/publisher-groups-sheet'
import { loadBoardPdfTypeface } from '~/features/display-board/server/board-pdf-fonts.server'
import { GROUP_SETS, printedName, publisherGroups, resetPeople } from './__fixtures__/board-sheets'
import {
  countPrinted,
  expectInsideMargins,
  expectNoOverlap,
  expectPrinted,
  renderSheet,
} from './__fixtures__/render-sheet'

// The groups sheet in every look and layout an admin can choose: what it actually prints. The
// promise the choices are curated around is that six groups of 25 hold on one A4 page, every name
// printed once and inside its column, whichever combination is picked.

vi.setConfig({ testTimeout: 60_000 })

beforeEach(() => resetPeople())

function everyone(groups: SheetPublisherGroup[]) {
  return groups.flatMap(group => [group.responsible, ...(group.deputy ? [group.deputy] : []), ...group.members])
}

async function print(
  groups: SheetPublisherGroup[],
  layout: (typeof BOARD_LAYOUTS)['publisher-groups'][number],
  typeface: (typeof BOARD_TYPEFACES)[number],
) {
  const pages = await renderSheet({ type: DynamicType.PublisherGroups, groups }, { typeface, accent: 'teal', layout })
  const plan = fitGroupsSheet(layout, groups, await loadBoardPdfTypeface(typeface))
  return { pages, plan }
}

describe.each(BOARD_TYPEFACES)('the groups sheet in %s', typeface => {
  describe.each(BOARD_LAYOUTS[DynamicType.PublisherGroups])('as %s', layout => {
    it('holds six groups of 25 on one page, every name printed once and inside its column', async () => {
      const groups = publisherGroups(GROUP_SETS['6x25'])

      const { pages, plan } = await print(groups, layout, typeface)

      expect(pages).toHaveLength(1)
      expect(plan.fallback).toBe(false)
      expect(plan.size).toBeGreaterThanOrEqual(9)
      expectPrinted(pages, everyone(groups).map(printedName))
      for (const someone of everyone(groups)) expect(countPrinted(pages, printedName(someone))).toBe(1)
      expectInsideMargins(pages)
      expectNoOverlap(pages)
    })

    it.each(['6x20', 'demo'] as const)('holds %s on one page', async set => {
      const groups = publisherGroups(GROUP_SETS[set])

      const { pages, plan } = await print(groups, layout, typeface)

      expect(pages).toHaveLength(1)
      expect(plan.fallback).toBe(false)
      expectPrinted(pages, everyone(groups).map(printedName))
      expectNoOverlap(pages)
    })

    it('takes the pages it planned for eight groups', async () => {
      const groups = publisherGroups(GROUP_SETS['8-real'])

      const { pages, plan } = await print(groups, layout, typeface)

      expect(pages).toHaveLength(plan.pages)
      // Only the directory promises eight groups on one page.
      if (layout === 'directory') expect(pages).toHaveLength(1)
      expectPrinted(pages, everyone(groups).map(printedName))
      expectInsideMargins(pages)
    })

    it('lets a group of 80 run over the pages it needs rather than lose a name', async () => {
      const groups = publisherGroups(GROUP_SETS['2x80'])

      const { pages } = await print(groups, layout, typeface)

      expectPrinted(pages, everyone(groups).map(printedName))
      expectInsideMargins(pages)
    })
  })
})

describe('a surname wider than any column', () => {
  it('is reported, and still printed in full', async () => {
    const groups = publisherGroups(GROUP_SETS['6x25'])
    groups[0].members[0] = { ...groups[0].members[0], lastname: 'Wolfeschlegelsteinhausenbergerdorffvoralternwaren' }

    const { pages, plan } = await print(groups, 'columns', 'fira')

    expect(plan.fallback).toBe(true)
    expectPrinted(pages, [printedName(groups[0].members[0])])
  })
})
