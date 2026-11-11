import { beforeEach, describe, expect, it, vi } from 'vitest'

// The template page's intents, run against an in-memory record of what each would write. A built-in template only
// takes its colour, an item of another template is refused, and who runs a template, duplicating and deleting it stay
// with the template managers.

const { writes, state } = vi.hoisted(() => ({
  writes: [] as string[],
  state: { ownParts: new Set<number>(), responsiblesRefused: false },
}))

vi.mock('~/features/events/index.server', async () => {
  const { ValidationError } = await import('~/shared/errors/app-error.server')
  return {
    updateTemplate: vi.fn(async (_db: unknown, id: number, fields: { name?: string }) => {
      writes.push(`update ${id} ${fields.name ?? ''}`.trim())
    }),
    saveTemplateResponsibles: vi.fn(async (_db: unknown, id: number, wanted: { programmeRoleId: number | null }) => {
      if (state.responsiblesRefused) throw new ValidationError('roleId', 'This role cannot run a template')
      writes.push(`responsibles ${id} ${wanted.programmeRoleId}`)
      return true
    }),
    templateItemBelongsToTemplate: vi.fn(async (_db: unknown, _kind: string, itemId: number) =>
      state.ownParts.has(itemId),
    ),
    upsertTemplatePart: vi.fn(async (_db: unknown, id: number, part: { id: number | null }) => {
      writes.push(`upsert-part ${id} ${part.id}`)
    }),
    deleteTemplatePart: vi.fn(async (_db: unknown, partId: number) => {
      writes.push(`delete-part ${partId}`)
    }),
    upsertTemplateServicePart: vi.fn(),
    deleteTemplateServicePart: vi.fn(),
    duplicateTemplate: vi.fn(async (_db: unknown, id: number) => {
      writes.push(`duplicate ${id}`)
      return { id: 99, name: 'Copie' }
    }),
    deleteTemplate: vi.fn(async (_db: unknown, id: number) => {
      writes.push(`delete ${id}`)
      return { ok: true, name: 'Réunion' }
    }),
  }
})

const { handleTemplateAction } = await import('./_template-action.server')

const MANAGER = { id: 7, congregationId: 1, isManager: true }
const RESPONSIBLE = { id: 8, congregationId: 1, isManager: false }

function dbWith(key: string | null) {
  return { eventTemplate: { findFirst: vi.fn(async () => (key == null ? null : { key })) } } as never
}

function form(fields: Record<string, string>): FormData {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) formData.set(name, value)
  return formData
}

beforeEach(() => {
  writes.length = 0
  state.ownParts = new Set([11])
  state.responsiblesRefused = false
})

describe('handleTemplateAction', () => {
  it('does nothing for a template of another congregation', async () => {
    const result = await handleTemplateAction(dbWith(null), 4, form({ intent: 'delete' }), MANAGER)
    expect(result).toBeNull()
    expect(writes).toEqual([])
  })

  it('refuses anything but its colour on a built-in template', async () => {
    const result = await handleTemplateAction(
      dbWith('day-off'),
      4,
      form({ intent: 'delete-part', partId: '11' }),
      MANAGER,
    )
    expect(result?.kind).toBe('refused')
    expect(writes).toEqual([])
  })

  it('saves the fields and who runs it for a manager', async () => {
    const result = await handleTemplateAction(
      dbWith('midweek'),
      4,
      form({ intent: 'update-template', name: 'Semaine', programmeRoleId: '3', serviceRoleId: 'none' }),
      MANAGER,
    )
    expect(result?.kind).toBe('saved')
    expect(writes).toEqual(['update 4 Semaine', 'responsibles 4 3'])
  })

  it('saves a responsible’s fields but never who runs the template', async () => {
    await handleTemplateAction(
      dbWith('midweek'),
      4,
      form({ intent: 'update-template', name: 'Semaine', programmeRoleId: '3', serviceRoleId: 'none' }),
      RESPONSIBLE,
    )
    expect(writes).toEqual(['update 4 Semaine'])
  })

  it('refuses a role that cannot run a template', async () => {
    state.responsiblesRefused = true
    const result = await handleTemplateAction(
      dbWith('midweek'),
      4,
      form({ intent: 'update-template', programmeRoleId: '999', serviceRoleId: 'none' }),
      MANAGER,
    )
    expect(result?.kind).toBe('refused')
  })

  it('edits and deletes a part of this template', async () => {
    await handleTemplateAction(dbWith('midweek'), 4, form({ intent: 'delete-part', partId: '11' }), RESPONSIBLE)
    expect(writes).toEqual(['delete-part 11'])
  })

  it('refuses a part of another template', async () => {
    const result = await handleTemplateAction(
      dbWith('midweek'),
      4,
      form({ intent: 'delete-part', partId: '12' }),
      RESPONSIBLE,
    )
    expect(result?.kind).toBe('refused')
    expect(writes).toEqual([])
  })

  it('leaves duplicating and deleting to the managers', async () => {
    expect(await handleTemplateAction(dbWith('midweek'), 4, form({ intent: 'duplicate' }), RESPONSIBLE)).toBeNull()
    expect(await handleTemplateAction(dbWith('midweek'), 4, form({ intent: 'delete' }), RESPONSIBLE)).toBeNull()
    expect(writes).toEqual([])
  })

  it('opens the copy after a manager duplicates the template', async () => {
    const result = await handleTemplateAction(dbWith('midweek'), 4, form({ intent: 'duplicate' }), MANAGER)
    expect(result).toMatchObject({ kind: 'moved', to: '/settings/templates/99' })
    expect(writes).toEqual(['duplicate 4'])
  })
})
