// Public server-only surface of the events feature.

export { getNextDaysOffs } from './server/days-off.server'
export { duplicateTemplate } from './server/duplicate-template.server'
export {
  deleteTemplate,
  deleteTemplatePart,
  deleteTemplateServicePart,
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
