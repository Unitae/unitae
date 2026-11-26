import { beforeEach, describe, expect, it, vi } from 'vitest'

// The template page's intents, run against an in-memory record of what each would write. A built-in template only
// takes its colour, an item of another template is refused, and duplicating and deleting it stay with the
// template managers.

const { writes, state } = vi.hoisted(() => ({
  writes: [] as string[],
  state: { ownParts: new Set<number>() },
}))

vi.mock('~/features/events/index.server', () => {
  return {
    updateTemplate: vi.fn(async (_db: unknown, id: number, fields: { name?: string; attendanceKind?: string }) => {
      writes.push(['update', id, fields.name, fields.attendanceKind].filter(Boolean).join(' '))
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
    moveEmptyMeetings: vi.fn(async (_db: unknown, id: number, ctx: { timeZone: string; actorId: number }) => {
      writes.push(`move-meetings ${id} ${ctx.timeZone} ${ctx.actorId}`)
      return { moved: 2, removed: 0 }
    }),
    deleteTemplate: vi.fn(async (_db: unknown, id: number) => {
      writes.push(`delete ${id}`)
      return { ok: true, name: 'Réunion' }
    }),
  }
})

const { handleTemplateAction } = await import('./_template-action.server')

const MANAGER = { id: 7, congregationId: 1, isManager: true, timeZone: 'Europe/Paris' }
const RESPONSIBLE = { id: 8, congregationId: 1, isManager: false, timeZone: 'Europe/Paris' }

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
})

describe('handleTemplateAction', () => {
  it('does nothing for a template of another congregation', async () => {
    const result = await handleTemplateAction(dbWith(null), 4, form({ intent: 'delete' }), MANAGER)
    expect(result).toBeNull()
    expect(writes).toEqual([])
  })

  it('refuses anything but its colour on a built-in template', async () => {
    const result = await handleTemplateAction(
      dbWith('freeform'),
      4,
      form({ intent: 'delete-part', partId: '11' }),
      MANAGER,
    )
    expect(result?.kind).toBe('refused')
    expect(writes).toEqual([])
  })

  it('saves the fields for a manager or a responsible: who runs its schedules is set on each schedule template', async () => {
    for (const actor of [MANAGER, RESPONSIBLE]) {
      writes.length = 0
      const result = await handleTemplateAction(
        dbWith('midweek'),
        4,
        // A tab opened before 6a-1b may still post the old responsible fields: they are ignored.
        form({ intent: 'update-template', name: 'Semaine', programmeRoleId: '3', serviceRoleId: 'none' }),
        actor,
      )
      expect(result?.kind).toBe('saved')
      expect(writes).toEqual(['update 4 Semaine'])
    }
  })

  it('saves how a template counts in attendance for a manager, never for a responsible', async () => {
    await handleTemplateAction(
      dbWith('midweek'),
      4,
      form({ intent: 'update-template', attendanceKind: 'midweek' }),
      MANAGER,
    )
    expect(writes).toEqual(['update 4 midweek'])

    writes.length = 0
    await handleTemplateAction(
      dbWith('midweek'),
      4,
      form({ intent: 'update-template', attendanceKind: 'weekend' }),
      RESPONSIBLE,
    )
    expect(writes).toEqual(['update 4'])
  })

  it('refuses an attendance kind that does not exist', async () => {
    const result = await handleTemplateAction(
      dbWith('midweek'),
      4,
      form({ intent: 'update-template', attendanceKind: 'monthly' }),
      MANAGER,
    )
    expect(result?.kind).toBe('refused')
    expect(writes).toEqual([])
  })

  // A type's parts and services are written from « Modèles de planning » (6a-1c): its page takes none of their intents.
  it.each(['upsert-part', 'delete-part', 'upsert-service-role', 'delete-service-role'])(
    'leaves %s to « Modèles de planning »',
    async intent => {
      expect(await handleTemplateAction(dbWith('midweek'), 4, form({ intent, partId: '11' }), MANAGER)).toBeNull()
      expect(writes).toEqual([])
    },
  )

  // Whoever may change the template's day — its responsible too — brings its empty meetings along.
  it('moves the empty meetings ahead for a responsible, in the congregation’s zone', async () => {
    const result = await handleTemplateAction(dbWith('study'), 4, form({ intent: 'move-meetings' }), RESPONSIBLE)

    expect(writes).toEqual(['move-meetings 4 Europe/Paris 8'])
    expect(result).toEqual({ kind: 'saved', message: '2 réunions déplacées.' })
  })

  it('never moves the meetings of a built-in template', async () => {
    await handleTemplateAction(dbWith('freeform'), 4, form({ intent: 'move-meetings' }), MANAGER)
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
