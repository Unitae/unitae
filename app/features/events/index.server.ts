// Public server-only surface of the events feature.

export { getNextDaysOffs } from './server/days-off.server'
export { deleteTemplate } from './server/delete-template.server'
export { duplicateTemplate } from './server/duplicate-template.server'
export {
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
export { getResponsibleTemplateIds, templateItemBelongsToTemplate } from './server/events-auth.server'
export {
  findLastAssignmentsForMembers,
  findNextAbsencesForMembers,
  findUpcomingAbsencesForMember,
  findUpcomingAssignmentsForMember,
  type LastAssignment,
  type NextAbsence,
} from './server/member-engagement.queries'
export { eventsNotifications } from './server/notifications.server'
export { getOurSpeakerListPage } from './server/our-speakers.queries'
export { removeOurSpeakerEntry } from './server/our-speakers.server'
export { getPartPresetById, listPartPresets, listPartPresetsForSettings } from './server/part-presets.queries'
export { createPartPreset, deletePartPreset, updatePartPreset } from './server/part-presets.server'
export { PART_PRESET_COUNT, seedDefaultPartPresets } from './server/seed-part-presets.server'
export { seedDefaultTemplates } from './server/seed-templates.server'
export { saveTemplateResponsibles, type TemplateResponsibles } from './server/template-responsibles.server'
