import type JsZip from 'jszip'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

const logger = createLogger('import-absences')

interface AbsenceRecord {
  id: number
  startDate: string
  endDate: string
  note?: string
  memberId: number | null
  accountId: number | null
  // 2.19 archives only: the day-off event the row was copied from.
  legacyEventId?: number | null
  createdAt: string
}

/**
 * Which of the archive's day-off events its absences file covers, or null for an archive without one (before 2.19; the
 * export writes the file even when there are none). A 2.19 file covers the events its rows name; a day-off it does not
 * cover — written by a version before the absences table, or a file emptied by hand — still gets its absence from the
 * event. From 2.20 the rows name no event: the file holds every absence, so it covers every day-off.
 */
export async function archivedAbsenceEvents(zip: JsZip): Promise<{ covers: (eventId: number) => boolean } | null> {
  if (zip.file('data/absences.ndjson') == null) return null
  const records = await readNdjsonFile<Pick<AbsenceRecord, 'legacyEventId'>>(zip, 'absences')
  if (records.some(record => !('legacyEventId' in record))) return { covers: () => true }
  const named = new Set(records.flatMap(record => (record.legacyEventId == null ? [] : [record.legacyEventId])))
  return { covers: eventId => named.has(eventId) }
}

function dateOf(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Absences (archive 2.19 on), after the records, the accounts and the events. Each keeps its person: the record when it
 * came with the archive, the account that declared it otherwise. The account is kept when it came too, dropped otherwise
 * — an account skipped because its e-mail belongs to another congregation leaves its absences with the record. The
 * day-off events are no longer restored, so a restored absence names none. One whose record and account both did not come is dropped, and so is one whose dates do
 * not read (only a hand-edited archive has them); both are counted.
 */
export async function importAbsences(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<AbsenceRecord>(zip, 'absences')
  let ownerless = 0
  let unreadable = 0
  const data = records.flatMap(record => {
    const memberId = idMap.getOptional('members', record.memberId)
    const accountId = idMap.getOptional('user-accounts', record.accountId)
    if (memberId == null && accountId == null) {
      ownerless++
      return []
    }
    const startDate = dateOf(record.startDate)
    const endDate = dateOf(record.endDate)
    if (startDate == null || endDate == null || startDate > endDate) {
      unreadable++
      return []
    }
    return [
      {
        startDate,
        endDate,
        note: record.note ?? '',
        memberId,
        accountId,
        createdAt: dateOf(record.createdAt) ?? new Date(),
        congregationId,
      },
    ]
  })
  if (ownerless > 0 || unreadable > 0) {
    logger.warn(
      `Skipped ${ownerless} absence(s) whose person was not imported and ${unreadable} whose dates did not read`,
      { congregationId },
    )
  }
  if (data.length > 0) await db.absence.createMany({ data })
}
