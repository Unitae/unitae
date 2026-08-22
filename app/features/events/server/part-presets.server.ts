import { PartPresetScope } from '~/features/events/model/part-preset.type'
import { partPresetName } from '~/features/events/model/part-preset-defaults'
import { setPartPresetAllowedRoles } from '~/features/events/server/allowed-roles.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

const NON_SLUG_RE = /[^a-z0-9]+/g
const TRIM_DASH_RE = /^-+|-+$/g

export interface PartPresetInput {
  // Null means "use the built-in wording" — see model/part-preset-defaults.ts.
  name: string | null
  hasReaderSlot: boolean
  speakerLabel: string | null
  readerLabel: string | null
  allowExternalSpeaker: boolean
  shareMessage: string | null
  allowedSpeakerRoleIds: number[]
  allowedReaderRoleIds: number[]
}

/**
 * A reader label only means something when there is a reader slot to label.
 * Storing one without the slot is an illegal state that would surface as a
 * second assignee field the programme editor can never fill, so the write path
 * normalizes it rather than trusting the caller.
 */
function normalize(data: PartPresetInput) {
  return {
    name: data.name,
    hasReaderSlot: data.hasReaderSlot,
    speakerLabel: data.speakerLabel,
    readerLabel: data.hasReaderSlot ? data.readerLabel : null,
    allowExternalSpeaker: data.allowExternalSpeaker,
    shareMessage: data.shareMessage,
  }
}

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(NON_SLUG_RE, '-')
    .replace(TRIM_DASH_RE, '')
}

/**
 * Builds a key that is readable and unique within the congregation.
 *
 * The key is the preset's identity — seeding looks system rows up by it, and
 * the backfill matches on it — so it is derived once at creation and never
 * rewritten afterwards, however the name later changes.
 */
async function buildKey(db: TransactionClient, name: string, congregationId: number): Promise<string> {
  const base = slugify(name) || 'preset'
  const existing = await db.partPreset.findMany({ where: { congregationId }, select: { key: true } })
  const taken = new Set(existing.map(preset => preset.key))

  if (!taken.has(base)) return base
  let suffix = 2
  while (taken.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
}

/**
 * Eligibility for the two slots.
 *
 * A kind with no reader slot cannot have reader roles — the selection would
 * apply to a slot that is never offered, and would come back into effect if the
 * slot were later re-enabled without anyone revisiting it.
 */
async function writeAllowedRoles(
  db: TransactionClient,
  presetId: number,
  data: PartPresetInput,
  congregationId: number,
): Promise<void> {
  await setPartPresetAllowedRoles(db, presetId, 'speaker', data.allowedSpeakerRoleIds, congregationId)
  await setPartPresetAllowedRoles(
    db,
    presetId,
    'reader',
    data.hasReaderSlot ? data.allowedReaderRoleIds : [],
    congregationId,
  )
}

export async function createPartPreset(
  db: TransactionClient,
  data: PartPresetInput,
  congregationId: number,
  actorId: number,
) {
  // buildKey reads the taken keys and then writes, so two managers creating a
  // same-named preset at once can both settle on the same slug. The unique
  // constraint catches the loser; retrying once re-reads the keys — now
  // including the winner's — and resolves it, instead of surfacing a raw 500.
  // A second failure is a real problem and is left to propagate.
  let preset: Awaited<ReturnType<typeof db.partPreset.create>> | undefined
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      preset = await db.partPreset.create({
        data: {
          ...normalize(data),
          key: await buildKey(db, data.name ?? '', congregationId),
          scope: PartPresetScope.Part,
          isSystem: false,
          congregationId,
        },
      })
      break
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 1) throw error
    }
  }
  if (!preset) throw new Error('createPartPreset: no preset created')

  await writeAllowedRoles(db, preset.id, data, congregationId)

  audit({
    action: AuditAction.PartPresetCreated,
    congregationId,
    actorId,
    entityType: 'PartPreset',
    entityId: preset.id,
    metadata: { name: partPresetName(preset) },
  })

  return preset
}

/**
 * Returns null when the preset does not exist.
 *
 * System presets are editable: the congregation owns the wording of its own
 * messages, and the slot labels with it. Only the key is off limits, which is
 * why it is absent from the update payload rather than guarded by a flag.
 */
export async function updatePartPreset(
  db: TransactionClient,
  id: number,
  data: PartPresetInput,
  congregationId: number,
  actorId: number,
) {
  const existing = await db.partPreset.findFirst({ where: { id, congregationId }, select: { id: true } })
  if (!existing) return null

  const preset = await db.partPreset.update({
    where: { id_congregationId: { id, congregationId } },
    data: normalize(data),
  })

  await writeAllowedRoles(db, id, data, congregationId)

  audit({
    action: AuditAction.PartPresetUpdated,
    congregationId,
    actorId,
    entityType: 'PartPreset',
    entityId: id,
    metadata: { name: partPresetName(preset) },
  })

  return preset
}

// Each refusal is its own member rather than 'not-found' | 'system' sharing
// one. Grouping them let a caller discriminate on 'system' alone and silently
// treat a vanished preset as an in-use one — which is exactly what happened.
export type DeletePartPresetResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'system' }
  | { ok: false; reason: 'in-use'; partCount: number }

/**
 * Deletion is refused in two cases rather than allowed to succeed quietly.
 *
 * A system preset would be recreated by the next seed run, and the backfill
 * matches parts on its key. A preset still referenced by parts is worse: the
 * foreign key is SET NULL, so deleting it would strip the kind from live
 * programme parts — and their share messages with it — with nothing to show
 * for it afterwards. The count is returned so the caller can say how many.
 */
export async function deletePartPreset(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
): Promise<DeletePartPresetResult> {
  const preset = await db.partPreset.findFirst({
    where: { id, congregationId },
    select: { key: true, name: true, isSystem: true, _count: { select: { templateParts: true, eventParts: true } } },
  })
  if (!preset) return { ok: false, reason: 'not-found' }
  if (preset.isSystem) return { ok: false, reason: 'system' }

  const partCount = preset._count.templateParts + preset._count.eventParts
  if (partCount > 0) return { ok: false, reason: 'in-use', partCount }

  await db.partPreset.delete({ where: { id_congregationId: { id, congregationId } } })

  audit({
    action: AuditAction.PartPresetDeleted,
    congregationId,
    actorId,
    entityType: 'PartPreset',
    entityId: id,
    metadata: { name: partPresetName(preset) },
  })

  return { ok: true, name: partPresetName(preset) }
}
