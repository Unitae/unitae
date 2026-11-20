// Public server-only surface of the events feature.

export { releaseAccountEvents } from './server/account-events.server'
export { type LastWeekMeeting, listLastWeekAttendance, listMeetingsUnderWay } from './server/attendance.queries'
export { getNextDaysOffs } from './server/days-off.server'
export { deleteTemplate } from './server/delete-template.server'
export { duplicateTemplate } from './server/duplicate-template.server'
export { countMeetingsToMove, EMPTY_MEETING } from './server/empty-meetings.queries'
export {
  getTemplateById,
  getTemplates,
  isTemplateResponsible,
  removeTemplateResponsible,
  setTemplateResponsible,
  updateTemplate,
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
export { moveEmptyMeetings } from './server/move-empty-meetings.server'
export { eventsNotifications } from './server/notifications.server'
export { getOurSpeakerListPage } from './server/our-speakers.queries'
export { removeOurSpeakerEntry } from './server/our-speakers.server'
export { getPartPresetById, listPartPresets, listPartPresetsForSettings } from './server/part-presets.queries'
export { createPartPreset, deletePartPreset, updatePartPreset } from './server/part-presets.server'
export { extendRecurringEvents, reanchorEmptyMeetings } from './server/recurring-events.server'
export { reorderTemplateServices } from './server/reorder-services.server'
export { PART_PRESET_COUNT, seedDefaultPartPresets } from './server/seed-part-presets.server'
export { seedDefaultTemplates } from './server/seed-templates.server'
export {
  deleteTemplatePart,
  deleteTemplateServicePart,
  reorderTemplateParts,
  upsertTemplatePart,
  upsertTemplateServicePart,
} from './server/template-items.server'
export { saveTemplateResponsibles, type TemplateResponsibles } from './server/template-responsibles.server'
