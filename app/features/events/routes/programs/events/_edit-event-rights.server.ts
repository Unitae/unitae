import { canFillSchedule } from '~/features/events/server/schedule-rights.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { Permission } from '~/shared/types/permission'
import { type IntentChecks, kindsFilledBy } from './_edit-event-intents.server'

// The editor's rights over the schedules its intents write (plan §10, D31), on top of the event right the route
// checks: a meeting may hold several duties schedules, and a service intent names the one it writes.

/**
 * Whether the caller may fill every schedule the intent writes (plan §10, D31), on top of the event right the route
 * checked: a service intent names its duties schedule (a meeting may hold several), whose responsible alone is asked.
 */
export async function fillsWhatIntentWrites(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  asked: { userId: number; congregationId: number },
  event: { id: number; templateId: number | null },
  posted: { intent: FormDataEntryValue | null; formData: FormData },
  checks: IntentChecks,
): Promise<boolean> {
  const { userId, congregationId } = asked
  const named = await serviceScheduleNamed(db, posted.intent, posted.formData, checks, congregationId)
  for (const kind of kindsFilledBy(posted.intent)) {
    const scheduleId = kind === 'service' ? named : null
    if (!(await canFillSchedule(db, can, userId, event, kind, congregationId, scheduleId))) return false
  }
  return true
}

/**
 * The duties schedule a service intent names, whose responsible alone the route then asks for: the one a service is
 * added to, or the one the service updated or deleted is in. Null when it names none, or an item of another event: the
 * route then asks for every duties schedule, and the intent refuses the item.
 */
export async function serviceScheduleNamed(
  db: TransactionClient,
  intent: FormDataEntryValue | null,
  formData: FormData,
  checks: IntentChecks,
  congregationId: number,
): Promise<number | null> {
  if (intent === 'add-service') {
    const posted = Number(formData.get('scheduleId'))
    return Number.isInteger(posted) && posted > 0 ? posted : null
  }
  if (intent !== 'update-service' && intent !== 'delete-service') return null
  const field = (name: string) => {
    const value = formData.get(name)
    return typeof value === 'string' && value !== '' ? value : undefined
  }
  const itemId = await checks.itemInEvent('service', {
    itemId: field('serviceItemId'),
    legacyId: field('serviceAssignmentId'),
  })
  if (itemId == null) return null
  const item = await db.item.findFirst({ where: { id: itemId, congregationId }, select: { scheduleId: true } })
  return item?.scheduleId ?? null
}
