// Public client-safe surface of the events feature.

export {
  MANAGED_ROLE_SLOTS_FIELD,
  type PartRoleSlot,
  partAllowedRolesToWrite,
} from './model/allowed-roles-write'
export { dayLabel, dayLabelShort } from './model/day-label'
export { EventStatus } from './model/event-status.type'
export { EventTemplateKey, isSystemTemplate } from './model/event-template.type'
export { groupPartsBySlot } from './model/group-parts-by-slot'
export type { MemberAbsence, MemberAssignment } from './model/member-engagement.type'
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
  groupProgrammeParts,
  type ProgrammePartLike,
  type ProgrammeSectionGroup,
  type ProgrammeTrackGroup,
  sectionDurationMin,
} from './model/programme-grouping'
export {
  findResponsible,
  RESPONSIBILITY_SCOPES,
  ResponsibilityScope,
  scopesCovering,
} from './model/responsibility-scope.type'
export { sectionColor, sectionIcon } from './model/section-style'
export {
  findUnknownVariables,
  renderShareMessage,
  SHARE_VARIABLES,
  type ShareMessageContext,
  type ShareVariable,
} from './model/share-message'
export { normalizeCongregationName, tidyCongregationName } from './model/speaker-congregation-name'
export { type PartPresetFormValues, partPresetSchema } from './schemas/part-preset.schema'
export {
  EventProgrammePanel,
  type PartAssignment,
  reorderPartIds,
} from './ui/EventProgrammePanel'
export { EventServicesPanel, type ServicePartAssignment } from './ui/EventServicesPanel'
export { InlineDeleteDialog } from './ui/InlineDeleteDialog'
export { PART_FORM_ID, type PartData, PartEditor, type PartPresetOption, partEditorCopy } from './ui/PartEditor'
export { PartEditSheet } from './ui/PartEditSheet'
export { PartPresetForm } from './ui/PartPresetForm'
export { PartPresetSummary } from './ui/PartPresetSummary'
export { SectionHeading, TrackHeading } from './ui/ProgrammeHeadings'
export { SERVICE_FORM_ID, ServiceEditor, serviceEditorCopy } from './ui/ServiceEditor'
export { ServiceEditSheet } from './ui/ServiceEditSheet'
export { SortableRow } from './ui/SortableRow'
