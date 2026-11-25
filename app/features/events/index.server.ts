// Public server-only surface of the events feature.

export { releaseAccountEvents } from './server/account-events.server'
export { kindOfSlot } from './server/allowed-roles.server'
export { type LastWeekMeeting, listLastWeekAttendance, listMeetingsUnderWay } from './server/attendance.queries'
export { getNextDaysOffs } from './server/days-off.server'
export { deleteTemplate } from './server/delete-template.server'
export { duplicateTemplate } from './server/duplicate-template.server'
export { countMeetingsToMove, EMPTY_MEETING } from './server/empty-meetings.queries'
export {
  getTemplateById,
  getTemplates,
  removeTemplateResponsible,
  setTemplateResponsible,
  updateTemplate,
} from './server/event-templates.server'
export { templateItemBelongsToTemplate } from './server/events-auth.server'
export {
  asEventPart,
  asEventServicePart,
  ITEM_KIND,
  ITEM_ORIGIN_INCLUDE,
  MIXED_ITEM_ORDER,
  PART_ITEM_ORDER,
  PART_ITEMS,
  PART_ITEMS_BY_DATE,
  PART_TIE_BREAK,
  publicItemId,
  SCHEDULED_ITEMS,
  SERVICE_ITEM_ORDER,
  SERVICE_ITEMS,
  SERVICE_ITEMS_BY_DATE,
  SERVICE_TIE_BREAK,
  splitItems,
} from './server/item-projection.server'
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
export { answersForASchedule } from './server/schedule-rights.server'
export {
  listScheduleTemplatesForSettings,
  type ScheduleTemplateSetting,
} from './server/schedule-template-settings.queries'
export { updateScheduleTemplate } from './server/schedule-template-settings.server'
export { syncTemplateScheduleTemplates } from './server/schedule-templates.server'
export { attachEventItems } from './server/schedules.server'
export { PART_PRESET_COUNT, seedDefaultPartPresets } from './server/seed-part-presets.server'
export { seedDefaultTemplates } from './server/seed-templates.server'
export {
  deleteTemplatePart,
  deleteTemplateServicePart,
  reorderTemplateParts,
  upsertTemplatePart,
  upsertTemplateServicePart,
} from './server/template-items.server'
export {
  makeRoomAtTemplateOrder,
  mergeLoneHalls,
  orderAtEndOf,
  renameTemplateHall,
  renameTemplateSection,
  splitSectionIntoHalls,
  templatePartPlace,
} from './server/template-sections.server'
