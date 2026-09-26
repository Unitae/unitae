import type { ProgrammeDynamicConfig } from '~/features/display-board/model/dynamic-document.type'
import type { BoardDocumentTemplateOptions } from '~/features/events'

// How the board's programme maps onto the programmes export sheet: which templates print their
// parts and their services, and how events are grouped. Same choices as the board screen.

interface ProgrammeInput {
  events: { templateId?: number | null }[]
  showServices: boolean
  config: ProgrammeDynamicConfig | null
}

export function programmePdfOptions(programme: ProgrammeInput): {
  configMap: Map<number, BoardDocumentTemplateOptions>
  groupBy: 'date' | 'template'
} {
  if (programme.config) {
    return {
      configMap: new Map(programme.config.templates.map(t => [t.templateId, { parts: t.parts, services: t.services }])),
      groupBy: programme.config.groupBy,
    }
  }

  // Legacy document: one template by key and a single services switch. Each template gets an
  // explicit entry because the sheet defaults to printing services for a template without one.
  // Today the legacy query already leaves services out when the switch is off, so this keeps the
  // two layers agreeing rather than being the only guard. Events without a template (not
  // produced by the legacy query, which joins on the template key) get no entry.
  const configMap = new Map<number, BoardDocumentTemplateOptions>()
  for (const event of programme.events) {
    if (event.templateId != null) configMap.set(event.templateId, { parts: true, services: programme.showServices })
  }
  return { configMap, groupBy: 'date' }
}
