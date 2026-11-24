import { beforeEach, describe, expect, it, vi } from 'vitest'

// A template's items, written from its page or from « Modèles de planning »: a part or a service of another template
// is refused, and an intent that is not an item's is left to the caller. Writes land in an in-memory list.

const { writes, own } = vi.hoisted(() => ({ writes: [] as string[], own: new Set<string>() }))

vi.mock('~/features/events/index.server', () => ({
  templateItemBelongsToTemplate: vi.fn((_db: unknown, kind: string, id: number) =>
    Promise.resolve(own.has(`${kind}:${id}`)),
  ),
  upsertTemplatePart: vi.fn((_db: unknown, templateId: number, part: { id?: number; name: string }) => {
    writes.push(`upsert-part ${templateId} ${part.id ?? 'new'} ${part.name}`)
    return Promise.resolve()
  }),
  deleteTemplatePart: vi.fn((_db: unknown, partId: number) => {
    writes.push(`delete-part ${partId}`)
    return Promise.resolve()
  }),
  upsertTemplateServicePart: vi.fn((_db: unknown, templateId: number, service: { key: string }) => {
    writes.push(`upsert-service ${templateId} ${service.key}`)
    return Promise.resolve()
  }),
  deleteTemplateServicePart: vi.fn((_db: unknown, id: number) => {
    writes.push(`delete-service ${id}`)
    return Promise.resolve()
  }),
}))

const { handleTemplateItemAction } = await import('./template-item-action.server')

const ACTOR = { id: 7, congregationId: 1 }
const form = (fields: Record<string, string>) => {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) formData.set(name, value)
  return formData
}

beforeEach(() => {
  writes.length = 0
  own.clear()
  own.add('part:11')
  own.add('service:21')
})

describe('handleTemplateItemAction', () => {
  it('adds a part, and edits or deletes one of this template', async () => {
    await handleTemplateItemAction({} as never, 4, form({ intent: 'upsert-part', partName: 'Prière' }), ACTOR)
    await handleTemplateItemAction(
      {} as never,
      4,
      form({ intent: 'upsert-part', partId: '11', partName: 'Discours' }),
      ACTOR,
    )
    const deleted = await handleTemplateItemAction({} as never, 4, form({ intent: 'delete-part', partId: '11' }), ACTOR)
    expect(writes).toEqual(['upsert-part 4 new Prière', 'upsert-part 4 11 Discours', 'delete-part 11'])
    expect(deleted?.kind).toBe('saved')
  })

  it('refuses a part or a service of another template, writing nothing', async () => {
    const results = await Promise.all([
      handleTemplateItemAction({} as never, 4, form({ intent: 'upsert-part', partId: '12', partName: 'X' }), ACTOR),
      handleTemplateItemAction({} as never, 4, form({ intent: 'delete-part', partId: '12' }), ACTOR),
      handleTemplateItemAction({} as never, 4, form({ intent: 'delete-service-role', roleId: '22' }), ACTOR),
    ])
    expect(results.map(result => result?.kind)).toEqual(['refused', 'refused', 'refused'])
    expect(writes).toEqual([])
  })

  it('keys a new service from its name', async () => {
    await handleTemplateItemAction({} as never, 4, form({ intent: 'upsert-service-role', roleName: 'Sono 2' }), ACTOR)
    expect(writes).toEqual(['upsert-service 4 sono-2'])
  })

  it('leaves an intent that is not an item’s to the caller', async () => {
    expect(await handleTemplateItemAction({} as never, 4, form({ intent: 'duplicate' }), ACTOR)).toBeUndefined()
    expect(writes).toEqual([])
  })
})
