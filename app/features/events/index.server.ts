// Public server-only surface of the events feature.

export { getNextDaysOffs } from './server/days-off.server'
export { eventsNotifications } from './server/notifications.server'
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
