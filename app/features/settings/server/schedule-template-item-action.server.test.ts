import { beforeEach, describe, expect, it, vi } from 'vitest'

// « Modèles de planning » writes a template's items through its first kind, the parts of a programme template and the
// services of a duties one only; a template no kind uses, or not there, has nothing to write through.

const { calls, items, outcome } = vi.hoisted(() => ({
  calls: [] as unknown[],
  outcome: { current: 'saved' as 'saved' | 'refused' },
  items: {
    current: null as {
      kind: string
      kindId: number | null
      parts?: { id: number }[]
      services?: { id: number }[]
      rooms?: { id: number }[]
    } | null,
  },
}))

vi.mock('./schedule-template-items.queries', () => ({
  getScheduleTemplateItems: vi.fn(async () => items.current),
}))
vi.mock('./template-item-action.server', async importOriginal => ({
  ...(await importOriginal<typeof import('./template-item-action.server')>()),
  handleTemplateItemAction: vi.fn(async (_db: unknown, templateId: number, formData: FormData) => {
    calls.push([templateId, formData.get('intent')])
    if (formData.get('intent') === 'upsert-part') calls.push(['track', formData.get('partTrack')])
    return outcome.current === 'saved' ? { kind: 'saved', message: 'ok' } : { kind: 'refused', response: null }
  }),
}))

vi.mock('~/shared/domain/audit.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/domain/audit.server')>()),
  auditInTransaction: vi.fn(
    async (_db: unknown, entry: { entityType: string; entityId: number; metadata: unknown }) => {
      calls.push(['audit', entry.entityType, entry.entityId, entry.metadata])
    },
  ),
}))

vi.mock('~/features/events/index.server', () => ({
  reorderTemplateServices: vi.fn(async (_db: unknown, _congregationId: number, kindId: number, ids: number[]) => {
    calls.push(['reorder-services', kindId, ids])
    return true
  }),
  renameTemplateSection: vi.fn(
    async (_db: unknown, target: { templateId: number; scheduleTemplateId: number }, from: string, to: string) => {
      calls.push(['rename-section', target.templateId, target.scheduleTemplateId, from, to])
      return from === 'Absente' ? 'gone' : to === 'Ministère' ? 'taken' : 'renamed'
    },
  ),
  // A write the service itself refuses: an order starting with part 99.
  reorderTemplateParts: vi.fn(async (_db: unknown, _congregationId: number, kindId: number, ids: number[]) => {
    calls.push(['reorder', kindId, ids])
    return ids[0] !== 99
  }),
  makeRoomAtTemplateOrder: vi.fn(async (_db: unknown, kindId: number, order: number) => {
    calls.push(['room', kindId, order])
  }),
  // Part 11 sits in « Ministère » at order 33; any other id is not the template's.
  templatePartPlace: vi.fn(async (_db: unknown, _kindId: number, partId: number) =>
    partId === 11 ? { section: 'Ministère', order: 33 } : null,
  ),
  // « Absente » was renamed or emptied elsewhere.
  placeExists: vi.fn(async (_db: unknown, _kindId: number, section: string) => section !== 'Absente'),
  orderAtEndOf: vi.fn(async (_db: unknown, kindId: number, section: string, partId: number | null) => {
    calls.push(['end', kindId, section, partId])
    return 40
  }),
}))

const { handleScheduleTemplateItem } = await import('./schedule-template-item-action.server')

const ACTOR = { id: 7, congregationId: 1 }
const form = (intent: string, fields: Record<string, string> = {}) => {
  const formData = new FormData()
  formData.set('intent', intent)
  for (const [name, value] of Object.entries(fields)) formData.set(name, value)
  return formData
}

beforeEach(() => {
  calls.length = 0
  outcome.current = 'saved'
})

describe('handleScheduleTemplateItem', () => {
  it('writes a programme template’s parts through its first kind', async () => {
    items.current = { kind: 'programme', kindId: 270 }
    expect(await handleScheduleTemplateItem({} as never, 3, form('upsert-part'), ACTOR)).toMatchObject({
      kind: 'saved',
    })
    expect(calls).toEqual([
      [270, 'upsert-part'],
      ['track', ''],
    ])
  })

  it('refuses a service intent on a programme template, and a part intent on a duties one', async () => {
    items.current = { kind: 'programme', kindId: 270 }
    const onProgramme = await handleScheduleTemplateItem({} as never, 3, form('upsert-service-role'), ACTOR)
    items.current = { kind: 'duty', kindId: 270 }
    const onDuties = await handleScheduleTemplateItem({} as never, 4, form('delete-part'), ACTOR)
    expect([onProgramme?.kind, onDuties?.kind]).toEqual(['refused', 'refused'])
    expect(calls).toEqual([])
  })

  it('refuses a template no kind uses, saying so, and has nothing for one not there', async () => {
    items.current = { kind: 'duty', kindId: null }
    expect(await handleScheduleTemplateItem({} as never, 4, form('upsert-service-role'), ACTOR)).toMatchObject({
      kind: 'refused',
    })
    items.current = null
    expect(await handleScheduleTemplateItem({} as never, 5, form('upsert-service-role'), ACTOR)).toBeNull()
    expect(calls).toEqual([])
  })

  it('renames a section of a programme template, through its first kind; a hall is no longer renamed', async () => {
    items.current = { kind: 'programme', kindId: 270 }
    const section = await handleScheduleTemplateItem(
      {} as never,
      3,
      form('rename-section', { from: 'Joyaux', to: 'Joyaux de la Parole' }),
      ACTOR,
    )
    const hall = await handleScheduleTemplateItem(
      {} as never,
      3,
      form('rename-hall', { section: 'Ministère', from: 'Salle B', to: 'Deuxième salle' }),
      ACTOR,
    )
    expect(section).toMatchObject({ kind: 'saved', message: 'Section renommée.' })
    expect(hall?.kind).toBe('refused')
    expect(calls).toEqual([['rename-section', 270, 3, 'Joyaux', 'Joyaux de la Parole']])
  })

  it('refuses a rename on a duties template, and answers a section no longer there', async () => {
    items.current = { kind: 'duty', kindId: 270 }
    const onDuties = await handleScheduleTemplateItem(
      {} as never,
      4,
      form('rename-section', { from: 'A', to: 'B' }),
      ACTOR,
    )
    items.current = { kind: 'programme', kindId: 270 }
    const gone = await handleScheduleTemplateItem(
      {} as never,
      3,
      form('rename-section', { from: 'Absente', to: 'B' }),
      ACTOR,
    )
    const taken = await handleScheduleTemplateItem(
      {} as never,
      3,
      form('rename-section', { from: 'Joyaux', to: 'Ministère' }),
      ACTOR,
    )
    expect([onDuties?.kind, gone?.kind, taken?.kind]).toEqual(['refused', 'refused', 'refused'])
    const status = (result: typeof gone) =>
      result?.kind === 'refused' ? (result.response as { init: ResponseInit | null }).init?.status : null
    expect([status(gone), status(taken)]).toEqual([409, 400])
    expect(JSON.stringify(taken)).toContain('Une autre section porte déjà ce nom')
  })

  it('makes room for a new part where it was added, and writes no track whatever the form sent', async () => {
    items.current = { kind: 'programme', kindId: 270 }
    await handleScheduleTemplateItem(
      {} as never,
      3,
      form('upsert-part', { partName: 'Visite', partSection: 'Joyaux', partTrack: 'Salle B', partOrder: '11' }),
      ACTOR,
    )
    expect(calls).toEqual([
      ['room', 270, 11],
      [270, 'upsert-part'],
      ['track', ''],
    ])
  })

  it('moves nothing for a part edited in its place, or a new one the form refuses', async () => {
    items.current = { kind: 'programme', kindId: 270 }
    await handleScheduleTemplateItem(
      {} as never,
      3,
      form('upsert-part', { partId: '11', partName: 'X', partSection: 'Ministère', partOrder: '4' }),
      ACTOR,
    )
    await handleScheduleTemplateItem({} as never, 3, form('upsert-part', { partOrder: '4' }), ACTOR)
    expect(calls).toEqual([
      [270, 'upsert-part'],
      ['track', ''],
      [270, 'upsert-part'],
      ['track', ''],
    ])
  })

  it('puts a part moved to another section at the end of it, whatever order the form sent', async () => {
    items.current = { kind: 'programme', kindId: 270 }
    const formData = form('upsert-part', { partId: '11', partName: 'X', partSection: 'Joyaux', partOrder: '4' })
    await handleScheduleTemplateItem({} as never, 3, formData, ACTOR)
    expect(formData.get('partOrder')).toBe('40')
    expect(calls).toEqual([
      ['end', 270, 'Joyaux', 11],
      ['room', 270, 40],
      [270, 'upsert-part'],
      ['track', ''],
    ])
  })

  it('keeps the stored order of a part edited in place, whatever order the form sent', async () => {
    items.current = { kind: 'programme', kindId: 270 }
    const formData = form('upsert-part', {
      partId: '11',
      partName: 'X',
      partSection: 'Ministère',
      partOrder: '',
      partTrackOrder: '9',
    })
    await handleScheduleTemplateItem({} as never, 3, formData, ACTOR)
    expect([formData.get('partOrder'), formData.get('partTrackOrder')]).toEqual(['33', null])
  })

  it('refuses to move a part to a section no longer there, or into a room no longer there, before writing', async () => {
    items.current = { kind: 'programme', kindId: 270, rooms: [{ id: 50 }, { id: 51 }] }
    const section = await handleScheduleTemplateItem(
      {} as never,
      3,
      form('upsert-part', { partId: '11', partName: 'X', partSection: 'Absente' }),
      ACTOR,
    )
    const rooms = form('upsert-part', { partId: '11', partName: 'X', partSection: 'Ministère', partRoomsManaged: 'on' })
    rooms.append('partRooms', '51')
    rooms.append('partRooms', '52')
    const room = await handleScheduleTemplateItem({} as never, 3, rooms, ACTOR)
    expect([section?.kind, room?.kind]).toEqual(['refused', 'refused'])
    expect(JSON.stringify(section)).toContain('Cette section n’existe plus')
    expect(JSON.stringify(room)).toContain('Cette salle n’existe plus')
    expect(calls).toEqual([])
  })

  it('saves a part with the template’s rooms', async () => {
    items.current = { kind: 'programme', kindId: 270, rooms: [{ id: 50 }, { id: 51 }] }
    const formData = form('upsert-part', {
      partId: '11',
      partName: 'X',
      partSection: 'Ministère',
      partRoomsManaged: 'on',
    })
    formData.append('partRooms', '51')
    expect(await handleScheduleTemplateItem({} as never, 3, formData, ACTOR)).toMatchObject({ kind: 'saved' })
  })

  it('puts a new part sent without a place at the end of its section', async () => {
    items.current = { kind: 'programme', kindId: 270 }
    await handleScheduleTemplateItem(
      {} as never,
      3,
      form('upsert-part', { partName: 'Visite', partSection: 'Joyaux', partOrder: '' }),
      ACTOR,
    )
    expect(calls).toEqual([
      ['end', 270, 'Joyaux', null],
      ['room', 270, 40],
      [270, 'upsert-part'],
      ['track', ''],
    ])
  })

  it('deletes a part through its first kind', async () => {
    items.current = { kind: 'programme', kindId: 270 }
    await handleScheduleTemplateItem({} as never, 3, form('delete-part', { partId: '11' }), ACTOR)
    expect(calls).toEqual([[270, 'delete-part']])
  })

  it('writes a new order of the programme’s parts through its first kind, without a toast', async () => {
    items.current = { kind: 'programme', kindId: 270, parts: [{ id: 1 }, { id: 2 }, { id: 3 }] }
    const result = await handleScheduleTemplateItem(
      {} as never,
      3,
      form('reorder-parts', { orderedIds: '[3,1,2]' }),
      ACTOR,
    )
    expect(result).toEqual({ kind: 'reordered' })
    expect(calls).toEqual([
      ['reorder', 270, [3, 1, 2]],
      ['audit', 'ScheduleTemplate', 3, { reordered: 'parts', count: 3 }],
    ])
  })

  it('refuses an order that is not exactly the programme’s parts (one added or gone meanwhile), and a duties one', async () => {
    items.current = { kind: 'programme', kindId: 270, parts: [{ id: 1 }, { id: 2 }, { id: 3 }] }
    const outcomes = []
    for (const orderedIds of ['[3,1]', '[3,1,2,9]', '[3,1,1]', '[3,1,9]', 'not json', '']) {
      outcomes.push(
        (await handleScheduleTemplateItem({} as never, 3, form('reorder-parts', { orderedIds }), ACTOR))?.kind,
      )
    }
    items.current = { kind: 'duty', kindId: 270, parts: [] }
    outcomes.push(
      (await handleScheduleTemplateItem({} as never, 4, form('reorder-parts', { orderedIds: '[]' }), ACTOR))?.kind,
    )
    expect(outcomes).toEqual(Array(7).fill('refused'))
    expect(calls).toEqual([])
  })

  it('answers an incomplete order 409 with « la liste a changé », so the page reloads; an unreadable one 400', async () => {
    items.current = { kind: 'programme', kindId: 270, parts: [{ id: 1 }, { id: 2 }] }
    const incomplete = await handleScheduleTemplateItem(
      {} as never,
      3,
      form('reorder-parts', { orderedIds: '[2]' }),
      ACTOR,
    )
    const unreadable = await handleScheduleTemplateItem(
      {} as never,
      3,
      form('reorder-parts', { orderedIds: 'x' }),
      ACTOR,
    )
    expect([statusOf(incomplete), statusOf(unreadable)]).toEqual([409, 400])
    expect(JSON.stringify(incomplete)).toContain('La liste a changé entre-temps')
  })

  it('answers 409 when the write itself is refused', async () => {
    items.current = { kind: 'programme', kindId: 270, parts: [{ id: 99 }, { id: 2 }] }
    const result = await handleScheduleTemplateItem(
      {} as never,
      3,
      form('reorder-parts', { orderedIds: '[99,2]' }),
      ACTOR,
    )
    expect([result?.kind, statusOf(result)]).toEqual(['refused', 409])
  })

  it('writes a duties template’s new services order through its first kind, and audits it', async () => {
    items.current = { kind: 'duty', kindId: 270, services: [{ id: 5 }, { id: 6 }] }
    const result = await handleScheduleTemplateItem(
      {} as never,
      4,
      form('reorder-services', { orderedIds: '[6,5]' }),
      ACTOR,
    )
    expect(result).toEqual({ kind: 'reordered' })
    expect(calls).toEqual([
      ['reorder-services', 270, [6, 5]],
      ['audit', 'ScheduleTemplate', 4, { reordered: 'services', count: 2 }],
    ])
  })

  it('refuses a services order that is not exactly the template’s services, and one on a programme', async () => {
    items.current = { kind: 'duty', kindId: 270, services: [{ id: 5 }, { id: 6 }] }
    const incomplete = await handleScheduleTemplateItem(
      {} as never,
      4,
      form('reorder-services', { orderedIds: '[6]' }),
      ACTOR,
    )
    items.current = { kind: 'programme', kindId: 270, parts: [{ id: 1 }] }
    const onProgramme = await handleScheduleTemplateItem(
      {} as never,
      3,
      form('reorder-services', { orderedIds: '[1]' }),
      ACTOR,
    )
    expect([incomplete?.kind, statusOf(incomplete), onProgramme?.kind]).toEqual(['refused', 409, 'refused'])
    expect(calls).toEqual([])
  })
})

function statusOf(result: Awaited<ReturnType<typeof handleScheduleTemplateItem>>) {
  return result?.kind === 'refused' ? (result.response as { init: ResponseInit | null }).init?.status : null
}
