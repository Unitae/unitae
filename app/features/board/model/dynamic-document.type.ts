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
