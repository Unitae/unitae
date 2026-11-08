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

function applyTemplate(templateId: number) {
  const formData = new FormData()
  formData.set('intent', 'apply-template')
  formData.set('templateId', String(templateId))
  return handleEditIntent('apply-template', formData, db, EVENT_ID, CONGREGATION_ID, USER_ID, 'Europe/Paris', {
    mayApplyTemplate: async templateId => templateId === OWNED_TEMPLATE_ID,
  })
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
