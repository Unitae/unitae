import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/features/events/server/event-parts.server', () => ({
  addPartAssignment: vi.fn(),
  addServicePartAssignment: vi.fn(),
  applyTemplateToEvent: vi.fn(),
  deletePartAssignment: vi.fn(),
  deleteServicePartAssignment: vi.fn(),
  updateEvent: vi.fn(),
  updatePartAssignment: vi.fn(),
  updateServicePartAssignment: vi.fn(),
}))

const { handleEditIntent } = await import('./_edit-event-intents.server')
const { applyTemplateToEvent } = await import('~/features/events/server/event-parts.server')

const db = {} as Parameters<typeof handleEditIntent>[2]
const EVENT_ID = 31
const CONGREGATION_ID = 4242
const USER_ID = 7777
const OWNED_TEMPLATE_ID = 1001
const FOREIGN_TEMPLATE_ID = 2002
// Parts and services: the first id belongs to the event in the URL, the second to another event.
const OWN_ID = 11
const FOREIGN_ID = 22

const checks = {
  mayApplyTemplate: async (templateId: number) => templateId === OWNED_TEMPLATE_ID,
  belongsToEvent: async (_kind: 'part' | 'service', id: number) => id === OWN_ID,
}

function post(fields: Record<string, string>) {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) formData.set(name, value)
  return handleEditIntent(fields.intent, formData, db, EVENT_ID, CONGREGATION_ID, USER_ID, 'Europe/Paris', checks)
}

function applyTemplate(templateId: number) {
  return post({ intent: 'apply-template', templateId: String(templateId) })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(applyTemplateToEvent).mockResolvedValue({ id: OWNED_TEMPLATE_ID, name: 'Réunion de semaine' } as never)
})

describe('handleEditIntent — apply-template', () => {
  it('applies a template whose events the caller may edit', async () => {
    const result = await applyTemplate(OWNED_TEMPLATE_ID)
    expect(result).toEqual({ message: 'Modèle « Réunion de semaine » appliqué.' })
  })

  // Applying moves the event onto the template, and who may edit the event follows its template: a template
  // responsible must not hand their event to another template's responsibles, nor copy a template they do not run.
  it('refuses a template whose events the caller may not edit', async () => {
    const result = await applyTemplate(FOREIGN_TEMPLATE_ID)
    expect(result != null && 'reply' in result).toBe(true)
  })
})

// The action checked that the caller may edit the event in the URL. The writers find a part or a service by its id
// alone, so an id from another event of the congregation must not ride on that check.
const INTENTS: [string, (id: number) => Record<string, string>][] = [
  ['update-part', id => ({ partAssignmentId: String(id), partName: 'Lecture de la Bible' })],
  ['delete-part', id => ({ partAssignmentId: String(id) })],
  ['update-service', id => ({ serviceAssignmentId: String(id), serviceName: 'Sono' })],
  ['delete-service', id => ({ serviceAssignmentId: String(id) })],
]

describe('handleEditIntent — parts and services', () => {
  it.each(INTENTS)('%s refuses a part or service of another event', async (intent, fields) => {
    const result = await post({ intent, ...fields(FOREIGN_ID) })
    expect(result != null && 'reply' in result).toBe(true)
  })

  it.each(INTENTS)('%s goes through for a part or service of this event', async (intent, fields) => {
    const result = await post({ intent, ...fields(OWN_ID) })
    expect(result != null && 'message' in result).toBe(true)
  })
})
