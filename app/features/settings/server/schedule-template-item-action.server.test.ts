import { beforeEach, describe, expect, it, vi } from 'vitest'

// « Modèles de planning » writes a template's items through its first kind, the parts of a programme template and the
// services of a duties one only; a template no kind uses, or not there, has nothing to write through.

const { calls, items } = vi.hoisted(() => ({
  calls: [] as unknown[],
  items: { current: null as { kind: string; kindId: number | null } | null },
}))

vi.mock('./schedule-template-items.queries', () => ({
  getScheduleTemplateItems: vi.fn(async () => items.current),
}))
vi.mock('./template-item-action.server', async importOriginal => ({
  ...(await importOriginal<typeof import('./template-item-action.server')>()),
  handleTemplateItemAction: vi.fn(async (_db: unknown, templateId: number, formData: FormData) => {
    calls.push([templateId, formData.get('intent')])
    return { kind: 'saved', message: 'ok' }
  }),
}))

const { handleScheduleTemplateItem } = await import('./schedule-template-item-action.server')

const ACTOR = { id: 7, congregationId: 1 }
const form = (intent: string) => {
  const formData = new FormData()
  formData.set('intent', intent)
  return formData
}

beforeEach(() => {
  calls.length = 0
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
})
