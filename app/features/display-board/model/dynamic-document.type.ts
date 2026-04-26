export const DynamicType = {
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PublisherGroups: 'publisher-groups',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  Pioneers: 'pioneers',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  Programme: 'programme',
} as const

export type DynamicType = (typeof DynamicType)[keyof typeof DynamicType]

export interface AvailableDynamicType {
  dynamicType: DynamicType
  dynamicRef: string | null
  defaultTitle: string
  alreadyAdded: boolean
}

export interface ProgrammeTemplateConfig {
  templateId: number
  parts: boolean
  services: boolean
}

export interface ProgrammeDynamicConfig {
  templates: ProgrammeTemplateConfig[]
  groupBy: 'date' | 'template'
}

/**
 * Parses and validates the dynamicConfig JSON for programme documents.
 * Returns null if the config is missing or invalid (legacy document).
 */
export function parseProgrammeConfig(raw: unknown): ProgrammeDynamicConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.templates)) return null
  return {
    templates: obj.templates as ProgrammeTemplateConfig[],
    groupBy: obj.groupBy === 'template' ? 'template' : 'date',
  }
}
