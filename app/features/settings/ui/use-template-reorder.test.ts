import { beforeEach, describe, expect, it, vi } from 'vitest'

// React and the router stood in for: one render at a time, the fetcher's submissions and the setters recorded.
const { fetcher, said, reordering } = vi.hoisted(() => ({
  fetcher: {
    state: 'idle',
    data: undefined as unknown,
    formData: undefined as FormData | undefined,
    sent: [] as unknown[],
  },
  said: { current: '' },
  reordering: { current: false },
}))
vi.mock('react', () => ({
  useState: (initial: unknown) =>
    typeof initial === 'boolean'
      ? [reordering.current, (next: (value: boolean) => boolean) => (reordering.current = next(reordering.current))]
      : [said.current, (next: string) => (said.current = next)],
}))
vi.mock('react-router', () => ({
  useFetcher: () => ({ ...fetcher, submit: (data: unknown) => fetcher.sent.push(data) }),
}))

const { useTemplateReorder } = await import('./use-template-reorder')

const part = (id: number, order: number, section = '') => ({
  id,
  name: `P${id}`,
  section,
  track: '',
  trackOrder: null,
  order,
  durationMin: 5,
})
// P1 · Joyaux (P2, P3) · P4
const parts = [part(1, 0), part(2, 1, 'Joyaux'), part(3, 2, 'Joyaux'), part(4, 3)]
const use = (docked: boolean, enabled = true) => useTemplateReorder({ templateId: 3, parts, enabled, docked })

beforeEach(() => {
  Object.assign(fetcher, { state: 'idle', data: undefined, formData: undefined, sent: [] })
  said.current = ''
  reordering.current = false
})

describe('useTemplateReorder', () => {
  it('drags on a wide screen; on a phone moves only while « Réorganiser » is on; never on a duties template', () => {
    expect(use(true).controls?.mode).toBe('drag')
    expect(use(true).toggle).toBeUndefined()
    expect(use(false).controls).toBeNull()
    use(false).toggle?.()
    expect(use(false).controls?.mode).toBe('buttons')
    expect(use(true, false).controls).toBeNull()
  })

  it('saves every part’s new order, and says an up or down move on a phone', () => {
    reordering.current = true
    use(false).controls?.top(2, 1, 'P4')
    use(false).controls?.group(3, 1, 0, 'P3')
    expect(fetcher.sent).toEqual([
      { intent: 'reorder-parts', orderedIds: '[1,4,2,3]' },
      { intent: 'reorder-parts', orderedIds: '[1,3,2,4]' },
    ])
    expect(said.current).toBe('« P3 » montée d’une place.')
    use(false).controls?.top(0, 1, 'P1')
    expect(said.current).toBe('« P1 » descendue d’une place.')
  })

  it('says nothing itself for a drag (the drag announces), and sends nothing for a move that moves nothing', () => {
    use(true).controls?.top(1, 1, 'Joyaux')
    expect(fetcher.sent).toEqual([])
    use(true).controls?.top(0, 2, 'P1')
    expect(said.current).toBe('')
  })

  it('shows the order being saved, then any refusal', () => {
    const sending = new FormData()
    sending.set('orderedIds', '[4,1,2,3]')
    Object.assign(fetcher, { state: 'submitting', formData: sending })
    expect(use(true).parts.map(each => each.id)).toEqual([4, 1, 2, 3])
    Object.assign(fetcher, { state: 'idle', formData: undefined, data: { error: { '': ['L’ordre a changé'] } } })
    expect(use(true).refusal).toBe('L’ordre a changé')
  })
})
