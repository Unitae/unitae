import { describe, expect, it, vi } from 'vitest'

vi.mock('./board-reading.queries', () => ({ listBoardItems: vi.fn() }))
vi.mock('./dynamic-documents.server', () => ({ getDynamicPreview: vi.fn() }))

const { loadBoardHome } = await import('./board-home.queries')
const { listBoardItems } = await import('./board-reading.queries')
const { getDynamicPreview } = await import('./dynamic-documents.server')

const HEX_COLOR = /^#/
const now = new Date('2026-11-08T12:00:00Z')
const base = { createdAt: now, visibleUntil: null, unread: false, badge: null }
const pdf = (id: number, sectionId: number, order: number, extra = {}) =>
  ({
    ...base,
    kind: 'pdf',
    id,
    title: `PDF ${id}`,
    sectionId,
    order,
    isHighlighted: false,
    hasThumbnail: false,
    replacedAt: null,
    ...extra,
  }) as never
const dynamic = (id: number, sectionId: number, order: number, extra = {}) =>
  ({
    ...base,
    kind: 'dynamic',
    id,
    title: `Dyn ${id}`,
    sectionId,
    order,
    isHighlighted: false,
    dynamicType: 'publisher-groups',
    dynamicRef: null,
    dynamicConfig: null,
    appearance: { accent: 'wine' },
    changedAt: null,
    ...extra,
  }) as never

describe('loadBoardHome', () => {
  it('puts highlighted documents « À la une » only, and the rest in their sections, in order', async () => {
    vi.mocked(listBoardItems).mockResolvedValue({
      sections: [
        { id: 1, name: 'Assemblée' },
        { id: 2, name: 'Vide' },
        { id: 3, name: 'Prédication' },
      ],
      items: [pdf(10, 1, 2), dynamic(20, 1, 1), pdf(11, 3, 0, { isHighlighted: true }), pdf(12, 3, 1)],
      unreadCount: 3,
    })
    vi.mocked(getDynamicPreview).mockResolvedValue('6 groupes')

    const home = await loadBoardHome({} as never, { userId: 1, congregationId: 1, now })

    expect(home.highlighted.map(c => c.id)).toEqual([11])
    expect(home.sections.map(s => [s.name, s.cards.map(c => c.id)])).toEqual([
      ['Assemblée', [20, 10]],
      ['Prédication', [12]],
    ])
    expect(home.unreadCount).toBe(3)
  })

  it('gives a dynamic document its summary and the accent its sheet is drawn in', async () => {
    vi.mocked(listBoardItems).mockResolvedValue({
      sections: [{ id: 1, name: 'Assemblée' }],
      items: [dynamic(20, 1, 0)],
      unreadCount: 0,
    })
    vi.mocked(getDynamicPreview).mockResolvedValue('6 groupes')

    const [card] = (await loadBoardHome({} as never, { userId: 1, congregationId: 1, now })).sections[0].cards

    expect(card).toMatchObject({ kind: 'dynamic', preview: '6 groupes', accent: expect.stringMatching(HEX_COLOR) })
    expect(card).not.toHaveProperty('dynamicConfig')
  })
})
