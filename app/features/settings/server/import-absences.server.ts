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
  legacyEventId: number | null
  createdAt: string
}

/** Whether the archive carries its absences (2.19 on): the export writes the file even when there are none. */
export function archiveCarriesAbsences(zip: JsZip): boolean {
  return zip.file('data/absences.ndjson') != null
}

/**
 * Absences (archive 2.19 on), after the records, the accounts and the events. Each keeps its person: the record when it
 * came with the archive, the account that declared it otherwise. The account and the day-off event are kept when they
 * came too, and dropped otherwise — an absence whose account was deleted before the export still has its record. One
 * nobody is away on any more is dropped, and counted.
 */
export async function importAbsences(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<AbsenceRecord>(zip, 'absences')
  let ownerless = 0
  const data = records.flatMap(record => {
    const memberId = idMap.getOptional('members', record.memberId)
    const accountId = idMap.getOptional('user-accounts', record.accountId)
    if (memberId == null && accountId == null) {
      ownerless++
      return []
    }
    return [
      {
        startDate: new Date(record.startDate),
        endDate: new Date(record.endDate),
        note: record.note ?? '',
        memberId,
        accountId,
        legacyEventId: idMap.getOptional('events', record.legacyEventId),
        createdAt: new Date(record.createdAt),
        congregationId,
      },
    ]
  })
  if (ownerless > 0) {
    logger.warn(`Skipped ${ownerless} absence(s) whose person was not imported`, { congregationId })
  }
  if (data.length > 0) await db.absence.createMany({ data })
}
