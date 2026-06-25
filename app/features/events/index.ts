// Public surface of the events feature.

export { dayLabel, dayLabelShort } from './model/day-label'
export { EventKind } from './model/event-kind.type'
export { groupPartsBySlot } from './model/group-parts-by-slot'
export { getNextDaysOffs } from './server/days-off.server'
export {
  deleteTemplatePart,
  deleteTemplateServiceRole,
  duplicateTemplate,
  getTemplateById,
  getTemplates,
  isTemplateResponsible,
  removeTemplateResponsible,
  reorderTemplateParts,
  setTemplateResponsible,
  updateTemplate,
  upsertTemplatePart,
  upsertTemplateServiceRole,
} from './server/programme-templates.server'
export { seedDefaultTemplates } from './server/seed-templates.server'
export { InlineDeleteDialog } from './ui/InlineDeleteDialog'
export { PartEditSheet } from './ui/PartEditSheet'
export { ServiceEditSheet } from './ui/ServiceEditSheet'
export { SortableRow } from './ui/SortableRow'
