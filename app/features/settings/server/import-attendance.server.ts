import type JsZip from 'jszip'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

const logger = createLogger('import-attendance')

interface AttendanceRecord {
  eventId: number
  inPerson: unknown
  inPersonById: number | null
  inPersonAt: string | null
  online: unknown
  onlineById: number | null
  onlineAt: string | null
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0

function dateOf(value: string | null): Date | null {
  if (value == null) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * One count as the archive holds it. A value that is not a number of people is dropped with its author and time:
 * keeping them would read as « cleared by X at T », a history that never happened.
 */
function countOf(value: unknown, byId: number | null, at: string | null, idMap: EntityIdMap) {
  if (value == null) return { value: null, byId: null, at: null, invalid: false }
  if (!isCount(value)) return { value: null, byId: null, at: null, invalid: true }
  return { value, byId: idMap.getOptional('user-accounts', byId), at: dateOf(at), invalid: false }
}

/**
 * Meeting attendance (archive 2.15 on). Each row follows its event; the counts of an event that did not come with the
 * archive are dropped. An author whose account the import skipped becomes unknown, but the count stays. Every drop is
 * logged, as the other importers do.
 */
export async function importAttendance(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<AttendanceRecord>(zip, 'attendance')
  let orphans = 0
  let invalid = 0
  const data = records.flatMap(record => {
    const eventId = idMap.getOptional('events', record.eventId)
    if (!eventId) {
      orphans++
      return []
    }
    const inPerson = countOf(record.inPerson, record.inPersonById, record.inPersonAt, idMap)
    const online = countOf(record.online, record.onlineById, record.onlineAt, idMap)
    invalid += Number(inPerson.invalid) + Number(online.invalid)
    return [
      {
        eventId,
        inPerson: inPerson.value,
        inPersonById: inPerson.byId,
        inPersonAt: inPerson.at,
        online: online.value,
        onlineById: online.byId,
        onlineAt: online.at,
        congregationId,
      },
    ]
  })
  if (orphans > 0 || invalid > 0) {
    logger.warn(
      `Skipped ${orphans} attendance row(s) whose event was not imported; dropped ${invalid} count(s) that were not a number of people`,
      { congregationId },
    )
  }
  if (data.length > 0) await db.attendance.createMany({ data, skipDuplicates: true })
}
