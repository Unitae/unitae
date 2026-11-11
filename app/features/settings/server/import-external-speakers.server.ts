import type JsZip from 'jszip'
import { normalizeCongregationName, tidyCongregationName } from '~/features/events'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

interface SpeakerCongregationRecord {
  id: number
  name: string
  responsibleName: string
  responsiblePhone: string
  responsibleEmail: string
  coordinatorName: string
  coordinatorPhone: string
  coordinatorEmail: string
  listDate: string | null
  notes: string
}

interface ExternalSpeakerRecord {
  id: number
  name: string
  congregationName: string
  phone: string | null
  email: string | null
  notes: string | null
  archivedAt: string | null
  // From 2.13 on. Absent from older archives, which only carry `congregationName`.
  speakerCongregationId?: number | null
  phone2?: string | null
  email2?: string | null
  talks?: number[]
  anonymizedAt?: string | null
}

const toDate = (value: string | null | undefined) => (value ? new Date(value) : null)

/** The congregations whose list of speakers the archived congregation received (2.13 and later). */
export async function importSpeakerCongregations(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<SpeakerCongregationRecord>(zip, 'speaker-congregations')
  for (const record of records) {
    const created = await db.speakerCongregation.create({
      data: {
        name: record.name,
        nameNormalized: normalizeCongregationName(record.name),
        responsibleName: record.responsibleName,
        responsiblePhone: record.responsiblePhone,
        responsibleEmail: record.responsibleEmail,
        coordinatorName: record.coordinatorName,
        coordinatorPhone: record.coordinatorPhone,
        coordinatorEmail: record.coordinatorEmail,
        listDate: toDate(record.listDate),
        notes: record.notes,
        congregationId,
      },
    })
    idMap.set('speaker-congregations', record.id, created.id)
  }
}

/**
 * Before 2.13 a congregation was free text on each speaker. Builds one congregation per spelling, named after the
 * spelling most speakers use (alphabetical on a tie) — the rule of the 20261111180000_add_speaker_congregations
 * migration, so restoring an old backup groups speakers exactly as migrating the live data did.
 */
async function createLegacyCongregations(
  db: TransactionClient,
  congregationId: number,
  records: ExternalSpeakerRecord[],
): Promise<Map<string, number>> {
  const spellings = new Map<string, Map<string, number>>()
  for (const record of records) {
    const key = normalizeCongregationName(record.congregationName)
    if (key === '') continue
    const uses = spellings.get(key) ?? new Map<string, number>()
    const display = tidyCongregationName(record.congregationName)
    uses.set(display, (uses.get(display) ?? 0) + 1)
    spellings.set(key, uses)
  }
  const ids = new Map<string, number>()
  for (const [key, uses] of spellings) {
    const [name] = [...uses.entries()].sort(([a, countA], [b, countB]) => countB - countA || (a < b ? -1 : 1))[0] ?? [
      '',
    ]
    const created = await db.speakerCongregation.create({ data: { name, nameNormalized: key, congregationId } })
    ids.set(key, created.id)
  }
  return ids
}

export async function importExternalSpeakers(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<ExternalSpeakerRecord>(zip, 'external-speakers')
  const legacy = records.filter(record => record.speakerCongregationId === undefined)
  const legacyIds = legacy.length > 0 ? await createLegacyCongregations(db, congregationId, legacy) : new Map()

  for (const record of records) {
    const speakerCongregationId =
      record.speakerCongregationId === undefined
        ? (legacyIds.get(normalizeCongregationName(record.congregationName)) ?? null)
        : idMap.getOptional('speaker-congregations', record.speakerCongregationId)
    const created = await db.externalSpeaker.create({
      data: {
        name: record.name,
        congregationName: record.congregationName,
        speakerCongregationId,
        phone: record.phone,
        phone2: record.phone2 ?? null,
        email: record.email,
        email2: record.email2 ?? null,
        notes: record.notes,
        talks: record.talks ?? [],
        archivedAt: toDate(record.archivedAt),
        anonymizedAt: toDate(record.anonymizedAt),
        congregationId,
      },
    })
    idMap.set('external-speakers', record.id, created.id)
  }
}
