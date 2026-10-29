export const DynamicType = {
  PublisherGroups: 'publisher-groups',
  Pioneers: 'pioneers',
  Programme: 'programme',
  Organigram: 'organigram',
} as const

export type DynamicType = (typeof DynamicType)[keyof typeof DynamicType]

export function isDynamicType(value: string): value is DynamicType {
  return (Object.values(DynamicType) as string[]).includes(value)
}

export interface AvailableDynamicType {
  dynamicType: DynamicType
  dynamicRef: string | null
  defaultTitle: string
  alreadyAdded: boolean
}

export type { ProgrammeDynamicConfig } from '~/features/display-board/schemas/dynamic-config.schema'
export { parseProgrammeDynamicConfig as parseProgrammeConfig } from '~/features/display-board/schemas/dynamic-config.schema'
