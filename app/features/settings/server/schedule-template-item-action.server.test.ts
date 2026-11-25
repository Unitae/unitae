import { beforeEach, describe, expect, it, vi } from 'vitest'

// « Modèles de planning » writes a template's items through its first kind, the parts of a programme template and the
// services of a duties one only; a template no kind uses, or not there, has nothing to write through.

const { calls, items, outcome } = vi.hoisted(() => ({
  calls: [] as unknown[],
  outcome: { current: 'saved' as 'saved' | 'refused' },
  items: { current: null as { kind: string; kindId: number | null } | null },
}))

vi.mock('./schedule-template-items.queries', () => ({
  getScheduleTemplateItems: vi.fn(async () => items.current),
}))
vi.mock('./template-item-action.server', async importOriginal => ({
  ...(await importOriginal<typeof import('./template-item-action.server')>()),
  handleTemplateItemAction: vi.fn(async (_db: unknown, templateId: number, formData: FormData) => {
    calls.push([templateId, formData.get('intent')])
    return outcome.current === 'saved' ? { kind: 'saved', message: 'ok' } : { kind: 'refused', response: null }
  }),
}))

vi.mock('~/features/events/index.server', () => ({
  renameTemplateSection: vi.fn(
    async (_db: unknown, target: { templateId: number; scheduleTemplateId: number }, from: string, to: string) => {
      calls.push(['rename-section', target.templateId, target.scheduleTemplateId, from, to])
      return from === 'Absente' ? 'gone' : to === 'Ministère' ? 'taken' : 'renamed'
    },
  ),
  renameTemplateHall: vi.fn(
    async (
      _db: unknown,
      target: { templateId: number; scheduleTemplateId: number },
      section: string,
      from: string,
      to: string,
    ) => {
      calls.push(['rename-hall', target.templateId, target.scheduleTemplateId, section, from, to])
      return 'renamed'
    },
  ),
  splitSectionIntoHalls: vi.fn(
    async (_db: unknown, target: { templateId: number; scheduleTemplateId: number }, section: string, main: string) => {
      calls.push(['split', target.templateId, section, main])
      return 2
    },
  ),
  makeRoomAtTemplateOrder: vi.fn(async (_db: unknown, kindId: number, order: number) => {
    calls.push(['room', kindId, order])
  }),
  mergeLoneHalls: vi.fn(async (_db: unknown, target: { templateId: number }, sections: string[]) => {
    calls.push(['merge', target.templateId, sections])
    return 0
  }),
  // Part 11 sits in « Ministère »; any other id is not the template's.
  templatePartSection: vi.fn(async (_db: unknown, _kindId: number, partId: number) =>
    partId === 11 ? 'Ministère' : null,
  ),
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
    expect(calls).toEqual([[270, 'upsert-part']])
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

  it('renames a section or a hall of a programme template, through its first kind', async () => {
    items.current = { kind: 'programme', kindId: 270 }
    const section = await handleScheduleTemplateItem(
      {} as never,
      3,
      form('rename-section', { from: 'Joyaux', to: 'Joyaux de la Parole' }),
      ACTOR,
    )
    await handleScheduleTemplateItem(
      {} as never,
      3,
      form('rename-hall', { section: 'Ministère', from: 'Salle B', to: 'Deuxième salle' }),
      ACTOR,
    )
    expect(section).toMatchObject({ kind: 'saved', message: 'Section renommée.' })
    expect(calls).toEqual([
      ['rename-section', 270, 3, 'Joyaux', 'Joyaux de la Parole'],
      ['rename-hall', 270, 3, 'Ministère', 'Salle B', 'Deuxième salle'],
    ])
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

  it('makes room for a new part where it was added, a new hall turning its section into halls first', async () => {
    items.current = { kind: 'programme', kindId: 270 }
    await handleScheduleTemplateItem(
      {} as never,
      3,
      form('upsert-part', { partName: 'Visite', partSection: 'Joyaux', partTrack: 'Salle B', partOrder: '11' }),
      ACTOR,
    )
    expect(calls).toEqual([
      ['split', 270, 'Joyaux', 'Salle principale'],
      ['room', 270, 11],
      [270, 'upsert-part'],
      ['merge', 270, ['Joyaux']],
    ])
  })

  it('splits nothing for a new part outside any hall: it only makes room', async () => {
    items.current = { kind: 'programme', kindId: 270 }
    await handleScheduleTemplateItem(
      {} as never,
      3,
      form('upsert-part', { partName: 'Visite', partSection: 'Joyaux', partOrder: '7' }),
      ACTOR,
    )
    expect(calls).toEqual([
      ['room', 270, 7],
      [270, 'upsert-part'],
      ['merge', 270, ['Joyaux']],
    ])
  })

  it('moves nothing for a part that is edited (a hall included), or a new one the form refuses', async () => {
    items.current = { kind: 'programme', kindId: 270 }
    await handleScheduleTemplateItem(
      {} as never,
      3,
      form('upsert-part', { partId: '11', partName: 'X', partSection: 'Joyaux', partTrack: 'Salle B', partOrder: '4' }),
      ACTOR,
    )
    await handleScheduleTemplateItem({} as never, 3, form('upsert-part', { partOrder: '4' }), ACTOR)
    expect(calls).toEqual([
      [270, 'upsert-part'],
      ['merge', 270, ['Ministère', 'Joyaux']],
      [270, 'upsert-part'],
    ])
  })

  it('checks the section a deleted part leaves for a lone hall, and nothing after a refusal', async () => {
    items.current = { kind: 'programme', kindId: 270 }
    await handleScheduleTemplateItem({} as never, 3, form('delete-part', { partId: '11' }), ACTOR)
    outcome.current = 'refused'
    await handleScheduleTemplateItem({} as never, 3, form('delete-part', { partId: '11' }), ACTOR)
    expect(calls).toEqual([
      [270, 'delete-part'],
      ['merge', 270, ['Ministère']],
      [270, 'delete-part'],
    ])
  })
})
