// Public client-safe surface of the events feature.

export { partAllowedRolesToWrite, resolveAllowedRoleIds } from './model/allowed-roles-resolution'
export { dayLabel, dayLabelShort } from './model/day-label'
export { EventStatus } from './model/event-status.type'
export { EventTemplateKey, isSystemTemplate } from './model/event-template.type'
export { groupPartsBySlot } from './model/group-parts-by-slot'
export { resolvePartCapability } from './model/part-capability'
export { PartPresetKey, PartPresetScope } from './model/part-preset.type'
export {
  hasPartPresetShareMessage,
  partPresetName,
  partPresetReaderLabel,
  partPresetShareMessage,
  partPresetSpeakerLabel,
} from './model/part-preset-defaults'
export {
  findUnknownVariables,
  renderShareMessage,
  SHARE_VARIABLES,
  type ShareMessageContext,
  type ShareVariable,
} from './model/share-message'
export { type PartPresetFormValues, partPresetSchema } from './schemas/part-preset.schema'
export { InlineDeleteDialog } from './ui/InlineDeleteDialog'
export { PartEditSheet } from './ui/PartEditSheet'
export { PartPresetForm } from './ui/PartPresetForm'
export { PartPresetSummary } from './ui/PartPresetSummary'
export { ServiceEditSheet } from './ui/ServiceEditSheet'
export { SortableRow } from './ui/SortableRow'
