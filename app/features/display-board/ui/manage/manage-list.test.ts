import { describe, expect, it } from 'vitest'
import type { ManagedItem } from '~/features/display-board/server/board-management.queries'
import type { ManageSection } from '~/features/display-board/ui/manage/ManageTable'
import { filterSections, mergeVisibleOrder, withPendingHighlight } from '~/features/display-board/ui/manage/manage-list'

const doc = (id: number, title = `Doc ${id}`, state: 'shown' | 'unpublished' = 'shown'): ManagedItem => ({
  kind: 'pdf',
  id,
  title,
  sectionId: 1,
  order: id,
  isHighlighted: false,
  state: state === 'shown' ? { kind: 'shown', until: null } : { kind: 'unpublished' },
  read: 0,
  audience: 0,
  updatedAt: new Date('2026-11-01'),
  ownedByUser: false,
})

const ids = (items: ManagedItem[]) => items.map(item => item.id)

describe('mergeVisibleOrder', () => {
  it('takes the new order as is when nothing is hidden', () => {
    const all = [doc(1), doc(2), doc(3)]

    expect(ids(mergeVisibleOrder(all, [doc(3), doc(1), doc(2)]))).toEqual([3, 1, 2])
  })

  it('keeps the rows a search hides in their places, the visible ones swapping the slots they held', () => {
    const all = [doc(1), doc(2), doc(3), doc(4), doc(5)]

    expect(ids(mergeVisibleOrder(all, [doc(4), doc(2)]))).toEqual([1, 4, 3, 2, 5])
  })

  it('moves a visible row past a hidden one only as far as the next visible slot', () => {
    const all = [doc(1), doc(2), doc(3)]

    expect(ids(mergeVisibleOrder(all, [doc(3), doc(1)]))).toEqual([3, 2, 1])
  })
})

describe('filterSections', () => {
  const sections: ManageSection[] = [
    { id: 1, name: 'Assemblée', roles: [], items: [doc(1, 'Nettoyage'), doc(2, 'Lettre', 'unpublished')] },
    { id: 2, name: 'Anciens', roles: [], items: [] },
  ]
  const run = (query: string) => filterSections(sections, new URLSearchParams(query))

  it('shows every section, empty ones included, with no search or state filter', () => {
    expect(run('').map(s => s.items.length)).toEqual([2, 0])
  })

  it('narrows rows by title and state, and hides the sections it leaves empty', () => {
    expect(run('q=nett').map(s => ids(s.items))).toEqual([[1]])
    expect(run('etat=unpublished').map(s => ids(s.items))).toEqual([[2]])
  })

  it('keeps a chosen section even when it is empty', () => {
    expect(run('section=2').map(s => s.name)).toEqual(['Anciens'])
  })
})

describe('withPendingHighlight', () => {
  const sections: ManageSection[] = [{ id: 1, name: 'Assemblée', roles: [], items: [doc(1), doc(2)] }]

  it('shows the rows « à la une » change on its way, and only those', () => {
    const [section] = withPendingHighlight(sections, { items: [{ kind: 'pdf', id: 2 }], highlighted: true })

    expect(section.items.map(item => item.isHighlighted)).toEqual([false, true])
  })

  it('reads a dynamic document under the name the request gives it', () => {
    const dynamic = { ...doc(3), kind: 'dynamic' as const }
    const [section] = withPendingHighlight([{ ...sections[0], items: [dynamic] }], {
      items: [{ kind: 'dyn', id: 3 }],
      highlighted: true,
    })

    expect(section.items[0].isHighlighted).toBe(true)
  })
})
