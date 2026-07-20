// Public server-only surface of the events feature.

export { getNextDaysOffs } from './server/days-off.server'
export {
  deleteTemplatePart,
  deleteTemplateServicePart,
  duplicateTemplate,
  getTemplateById,
  getTemplates,
  isTemplateResponsible,
  removeTemplateResponsible,
  reorderTemplateParts,
  setTemplateResponsible,
  updateTemplate,
  upsertTemplatePart,
  upsertTemplateServicePart,
} from './server/event-templates.server'
export { eventsNotifications } from './server/notifications.server'
export { seedDefaultTemplates } from './server/seed-templates.server'
