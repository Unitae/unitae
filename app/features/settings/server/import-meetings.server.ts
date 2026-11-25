import type JsZip from 'jszip'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { EntityIdMap } from './data-transfer.type'
import { importAbsences } from './import-absences.server'
import { importAttendance } from './import-attendance.server'
import {
  importEventTemplates,
  importTemplatePartAllowedRoles,
  importTemplateParts,
  importTemplateResponsibles,
  importTemplateServicePartAllowedRoles,
  importTemplateServiceParts,
} from './import-event-templates.server'
import {
  importEventPartAllowedRoles,
  importEventParts,
  importEventServicePartAllowedRoles,
  importEventServiceParts,
  importEvents,
  settleImportedEventOrigins,
} from './import-events.server'
import { importPartPresets } from './import-part-presets.server'
import {
  importEventSchedules,
  importKindScheduleTemplates,
  importScheduleTemplates,
  settleImportedSchedules,
} from './import-schedules.server'
import { importTemplateRooms } from './import-template-rooms.server'

/**
 * The meeting steps of runImport, in their order: part presets, templates and their items and responsibles, events with
 * their absences, counts, schedules and items, then the schedules settled. `progress` is runImport's, called after
 * each step (IMPORT_TOTAL_STEPS counts them).
 */
export async function importMeetings(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
  progress: () => Promise<void>,
) {
  // Before the template and event parts: their presetId resolves through the map this fills.
  await importPartPresets(zip, db, idMap, congregationId)
  await progress()

  await importEventTemplates(zip, db, idMap, congregationId)
  await progress()

  // Before the template items, which name them.
  await importScheduleTemplates(zip, db, idMap, congregationId)
  await progress()

  const mergedTemplateIds = await importKindScheduleTemplates(zip, db, idMap, congregationId)
  await progress()

  await importTemplateParts(zip, db, idMap, congregationId)
  await progress()

  await importTemplatePartAllowedRoles(zip, db, idMap, congregationId)
  await progress()

  await importTemplateServiceParts(zip, db, idMap, congregationId)
  await progress()

  await importTemplateServicePartAllowedRoles(zip, db, idMap, congregationId)
  await progress()

  await importTemplateResponsibles(zip, db, idMap, congregationId)
  await progress()

  const withoutOrigin = await importEvents(zip, db, idMap, congregationId)
  await importAbsences(zip, db, idMap, congregationId)
  await importAttendance(zip, db, idMap, congregationId)
  await progress()

  // Before the event items, which name them.
  await importEventSchedules(zip, db, idMap, congregationId)
  await progress()

  await importEventParts(zip, db, idMap, congregationId)
  await progress()

  await importEventPartAllowedRoles(zip, db, idMap, congregationId)
  await progress()

  await importEventServiceParts(zip, db, idMap, congregationId)
  await settleImportedEventOrigins(db, withoutOrigin, congregationId)
  await progress()

  await importEventServicePartAllowedRoles(zip, db, idMap, congregationId)
  await progress()

  // Last: it finds the items that came without a schedule, so every item must be in.
  await settleImportedSchedules(zip, db, congregationId, mergedTemplateIds)
  // Once every template part is in its schedule template; an older archive's copies merge, their meeting parts too.
  await importTemplateRooms(zip, db, idMap, congregationId)
  await progress()
}
