import { beforeEach, describe, expect, it, vi } from 'vitest'

// The room intents of « Modèles de planning »: what each outcome of the room services answers. The services
// themselves are tested against the database (template-rooms.server.integration.test.ts).

const addTemplateRoom = vi.fn()
const renameTemplateRoom = vi.fn()
const deleteTemplateRoom = vi.fn()
vi.mock('~/features/events/index.server', () => ({ addTemplateRoom, renameTemplateRoom, deleteTemplateRoom }))

const { handleRoomIntent } = await import('./schedule-template-room-action.server')

const db = {} as never
const actor = { id: 7, congregationId: 3 }
const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}
const statusOf = (result: Awaited<ReturnType<typeof handleRoomIntent>>) =>
  result.kind === 'refused' ? (result.response as { init: ResponseInit | null }).init?.status : null

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleRoomIntent', () => {
  it('adds a room by its name and says so', async () => {
    addTemplateRoom.mockResolvedValue({ outcome: 'added', id: 41 })
    const result = await handleRoomIntent(db, 12, form({ intent: 'add-room', name: 'Salle B' }), actor)
    expect(result).toMatchObject({ kind: 'saved' })
    expect(addTemplateRoom).toHaveBeenCalledWith(db, 12, 'Salle B', 3, 7)
  })

  it('refuses a blank name, a name already used, and a template gone', async () => {
    for (const [outcome, status] of [
      ['blank', 400],
      ['long', 400],
      ['taken', 400],
      ['gone', 409],
    ] as const) {
      addTemplateRoom.mockResolvedValueOnce({ outcome })
      expect(statusOf(await handleRoomIntent(db, 12, form({ intent: 'add-room', name: 'x' }), actor))).toBe(status)
    }
  })

  it('renames a room, and refuses an unchanged or taken name, or a room gone', async () => {
    renameTemplateRoom.mockResolvedValueOnce('renamed')
    expect(
      await handleRoomIntent(db, 12, form({ intent: 'rename-room', roomId: '41', name: 'Annexe' }), actor),
    ).toMatchObject({ kind: 'saved' })
    expect(renameTemplateRoom).toHaveBeenCalledWith(db, 12, 41, 'Annexe', 3, 7)
    for (const [outcome, status] of [
      ['unchanged', 400],
      ['long', 400],
      ['taken', 400],
      ['blank', 400],
      ['gone', 409],
    ] as const) {
      renameTemplateRoom.mockResolvedValueOnce(outcome)
      const result = await handleRoomIntent(db, 12, form({ intent: 'rename-room', roomId: '41', name: 'x' }), actor)
      expect(statusOf(result)).toBe(status)
    }
  })

  it('deletes a room, never the main room, and refuses a room gone', async () => {
    deleteTemplateRoom.mockResolvedValueOnce('deleted')
    expect(await handleRoomIntent(db, 12, form({ intent: 'delete-room', roomId: '41' }), actor)).toMatchObject({
      kind: 'saved',
    })
    expect(deleteTemplateRoom).toHaveBeenCalledWith(db, 12, 41, 3, 7)
    deleteTemplateRoom.mockResolvedValueOnce('main')
    expect(statusOf(await handleRoomIntent(db, 12, form({ intent: 'delete-room', roomId: '40' }), actor))).toBe(400)
    deleteTemplateRoom.mockResolvedValueOnce('gone')
    expect(statusOf(await handleRoomIntent(db, 12, form({ intent: 'delete-room', roomId: '41' }), actor))).toBe(409)
  })

  it('refuses a room id that is not one, before any write', async () => {
    const result = await handleRoomIntent(db, 12, form({ intent: 'delete-room', roomId: 'abc' }), actor)
    expect(statusOf(result)).toBe(400)
    expect(deleteTemplateRoom).not.toHaveBeenCalled()
  })
})
