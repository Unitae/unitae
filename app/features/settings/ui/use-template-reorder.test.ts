import { beforeEach, describe, expect, it, vi } from 'vitest'

// React and the router stood in for: state and refs kept per call order across renders, effects run after each
// render, the fetcher's submissions recorded.
const { slots, effects, fetcher } = vi.hoisted(() => ({
  slots: [] as { current: unknown }[],
  effects: [] as (() => void)[],
  fetcher: {
    state: 'idle',
    data: undefined as unknown,
    formData: undefined as FormData | undefined,
    sent: [] as unknown[],
  },
}))
let slot = 0
const next = (initial: unknown) => {
  slots[slot] ??= { current: initial }
  return slots[slot++] as { current: unknown }
}
vi.mock('react', () => ({
  useRef: (initial: unknown) => next(initial),
  useState: (initial: unknown) => {
    const cell = next(initial)
    return [
      cell.current,
      (value: unknown) => {
        cell.current = typeof value === 'function' ? (value as (old: unknown) => unknown)(cell.current) : value
      },
    ]
  },
  useEffect: (run: () => void) => effects.push(run),
}))
vi.mock('react-router', () => ({
  useFetcher: () => ({ ...fetcher, submit: (data: unknown, options: unknown) => fetcher.sent.push([data, options]) }),
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
const services = [{ id: 21 }, { id: 22 }, { id: 23 }]
const render = (docked: boolean, enabled = true, of: 'parts' | 'services' = 'parts') => {
  slot = 0
  effects.length = 0
  const result = useTemplateReorder({ templateId: 3, of, parts, services, enabled, docked })
  for (const effect of effects) effect()
  return result
}
// The answer comes in: one render runs its effect, which sets what the next render shows (React re-renders itself).
const answer = (data: unknown, docked = false) => {
  Object.assign(fetcher, { state: 'idle', formData: undefined, data })
  render(docked)
}

beforeEach(() => {
  slots.length = 0
  Object.assign(fetcher, { state: 'idle', data: undefined, formData: undefined, sent: [] })
})

describe('useTemplateReorder', () => {
  it('drags on a wide screen; on a phone moves only while « Réorganiser » is on; never on a duties template', () => {
    expect(render(true).controls?.mode).toBe('drag')
    expect(render(true).toggle).toBeUndefined()
    expect(render(false).controls).toBeNull()
    render(false).toggle?.()
    expect(render(false).controls?.mode).toBe('buttons')
    slots.length = 0
    expect(render(true, false).controls).toBeNull()
  })

  it('saves every part’s new order', () => {
    render(false).toggle?.()
    render(false).controls?.top(2, 1, 'P4')
    render(false).controls?.group(3, 1, 0, 'P3')
    expect(fetcher.sent).toEqual([
      [{ intent: 'reorder-parts', orderedIds: '[1,4,2,3]' }, { method: 'post' }],
      [{ intent: 'reorder-parts', orderedIds: '[1,3,2,4]' }, { method: 'post' }],
    ])
  })

  it('builds a move made while the previous one saves on the order being saved, not the stored one', () => {
    const sending = new FormData()
    sending.set('orderedIds', '[4,1,2,3]')
    Object.assign(fetcher, { state: 'submitting', formData: sending })
    // P1 is now second at the top: moved first, after P4.
    render(true).controls?.top(1, 0, 'P1')
    expect(fetcher.sent).toEqual([[{ intent: 'reorder-parts', orderedIds: '[1,4,2,3]' }, { method: 'post' }]])
  })

  it('shows no refusal while a new order saves', () => {
    answer({ ok: false, errors: ['La liste a changé'] }, true)
    expect(render(true).refusal).toBe('La liste a changé')
    Object.assign(fetcher, { state: 'submitting' })
    expect(render(true).refusal).toBe('')
  })

  it('says an up or down move once it is saved, the refusal instead when refused, and the same words twice', () => {
    render(false).toggle?.()
    render(false).controls?.group(3, 1, 0, 'P3')
    expect(render(false).announcement).toBe('')
    answer({ ok: true })
    expect(render(false).announcement.trim()).toBe('« P3 » montée d’une place.')
    const first = render(false).announcement
    render(false).controls?.group(3, 1, 0, 'P3')
    answer({ ok: true })
    const second = render(false).announcement
    expect([second.trim(), second === first]).toEqual(['« P3 » montée d’une place.', false])
    render(false).controls?.top(0, 1, 'P1')
    answer({ ok: false, errors: ['La liste a changé'] })
    const refused = render(false)
    expect([refused.announcement.trim(), refused.refusal]).toEqual(['La liste a changé', 'La liste a changé'])
  })

  it('says nothing itself for a drag (the drag announces), and sends nothing for a move that moves nothing', () => {
    render(true).controls?.top(1, 1, 'Joyaux')
    expect(fetcher.sent).toEqual([])
    render(true).controls?.top(0, 2, 'P1')
    answer({ ok: true }, true)
    expect(render(true).announcement).toBe('')
  })

  it('shows the order being saved, then a refusal in either shape', () => {
    const sending = new FormData()
    sending.set('orderedIds', '[4,1,2,3]')
    Object.assign(fetcher, { state: 'submitting', formData: sending })
    expect(render(true).parts.map(each => each.id)).toEqual([4, 1, 2, 3])
    answer({ error: { '': ['La liste a changé'] } }, true)
    expect(render(true).refusal).toBe('La liste a changé')
    answer({ ok: false, templateId: 3, errors: ['Ce modèle n’existe plus'] }, true)
    expect(render(true).refusal).toBe('Ce modèle n’existe plus')
  })

  it('moves a duties template’s services as a flat list, and shows their order while it saves', () => {
    render(true, true, 'services').controls?.top(2, 0, 'Sono')
    expect(fetcher.sent).toEqual([[{ intent: 'reorder-services', orderedIds: '[23,21,22]' }, { method: 'post' }]])
    const sending = new FormData()
    sending.set('orderedIds', '[23,21,22]')
    Object.assign(fetcher, { state: 'submitting', formData: sending })
    expect(render(true, true, 'services').services.map(each => each.id)).toEqual([23, 21, 22])
  })

  it('says a service’s move in its own words (masculine in French)', () => {
    render(false, true, 'services').toggle?.()
    render(false, true, 'services').controls?.top(0, 1, 'Sono')
    answer({ ok: true })
    expect(render(false, true, 'services').announcement.trim()).toBe('« Sono » descendu d’une place.')
  })
})
