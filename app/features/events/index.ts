// Public client-safe surface of the events feature.

export { dayLabel, dayLabelShort } from './model/day-label'
export { EventStatus } from './model/event-status.type'
export { EventTemplateKey, isSystemTemplate } from './model/event-template.type'
export { groupPartsBySlot } from './model/group-parts-by-slot'
export { PartPresetKey, PartPresetScope } from './model/part-preset.type'
export {
  findUnknownVariables,
  renderShareMessage,
  SHARE_VARIABLES,
  type ShareMessageContext,
  type ShareVariable,
} from './model/share-message'
export { InlineDeleteDialog } from './ui/InlineDeleteDialog'
export { PartEditSheet } from './ui/PartEditSheet'
export { ServiceEditSheet } from './ui/ServiceEditSheet'
export { SortableRow } from './ui/SortableRow'
