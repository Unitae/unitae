import type { ProgrammeDynamicConfig } from '~/features/display-board/model/dynamic-document.type'

// How the board's programme maps onto the programmes export sheet: which templates print their
// parts and their services, and how events are grouped. Same choices as the board screen.

export interface ProgrammeTemplateOptions {
  parts: boolean
  services: boolean
}

interface ProgrammeInput {
  events: { templateId?: number | null }[]
  showServices: boolean
  config: ProgrammeDynamicConfig | null
}

export function programmePdfOptions(programme: ProgrammeInput): {
  configMap: Map<number, ProgrammeTemplateOptions>
  groupBy: 'date' | 'template'
} {
  if (programme.config) {
    return {
      configMap: new Map(programme.config.templates.map(t => [t.templateId, { parts: t.parts, services: t.services }])),
      groupBy: programme.config.groupBy,
    }
  }

  // Legacy document: one template by key and a single services switch. Every event gets an
  // explicit entry, since the sheet prints services for a template it has no entry for.
  const configMap = new Map<number, ProgrammeTemplateOptions>()
  for (const event of programme.events) {
    if (event.templateId != null) configMap.set(event.templateId, { parts: true, services: programme.showServices })
  }
  return { configMap, groupBy: 'date' }
}
