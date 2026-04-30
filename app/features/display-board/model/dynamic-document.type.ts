export const DynamicType = {
  PublisherGroups: 'publisher-groups',
  Pioneers: 'pioneers',
  Programme: 'programme',
} as const

export type DynamicType = (typeof DynamicType)[keyof typeof DynamicType]

export interface AvailableDynamicType {
  dynamicType: DynamicType
  dynamicRef: string | null
  defaultTitle: string
  alreadyAdded: boolean
}

export type { ProgrammeDynamicConfig } from '~/features/display-board/schemas/dynamic-config.schema'
export { parseProgrammeDynamicConfig as parseProgrammeConfig } from '~/features/display-board/schemas/dynamic-config.schema'
