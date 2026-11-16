import type JsZip from 'jszip'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

interface AttendanceRecord {
  eventId: number
  inPerson: number | null
  inPersonById: number | null
  inPersonAt: string | null
  online: number | null
  onlineById: number | null
  onlineAt: string | null
}

/** A number of people, or empty: anything else in an archive is treated as never entered. */
const count = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null)
const date = (value: string | null) => (value == null ? null : new Date(value))

/**
 * Meeting attendance (archive 2.15 on). Each row follows its event; the counts of an event that did not come with the
 * archive are dropped. An author whose account the import skipped becomes unknown, but the count stays.
 */
export async function importAttendance(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<AttendanceRecord>(zip, 'attendance')
  const data = records.flatMap(record => {
    const eventId = idMap.getOptional('events', record.eventId)
    if (!eventId) return []
    return [
      {
        eventId,
        inPerson: count(record.inPerson),
        inPersonById: idMap.getOptional('user-accounts', record.inPersonById),
        inPersonAt: date(record.inPersonAt),
        online: count(record.online),
        onlineById: idMap.getOptional('user-accounts', record.onlineById),
        onlineAt: date(record.onlineAt),
        congregationId,
      },
    ]
  })
  if (data.length > 0) await db.attendance.createMany({ data, skipDuplicates: true })
}
