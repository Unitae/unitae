import { PartPresetScope } from '~/features/events/model/part-preset.type'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * The presets offered when choosing what kind a programme part is, with the
 * capability each one carries.
 *
 * The capability travels because the part editor has to show what choosing a
 * kind actually does — without it the picker could only change a name, which
 * is what made selecting a preset appear to have no effect at all.
 *
 * The share message does not travel. A body runs to a thousand characters and
 * the editor only needs to know whether one exists, so it is reduced to a flag
 * here rather than sent to the client on every programme edit.
 */
export async function listPartPresets(db: TransactionClient, congregationId: number) {
  const presets = await db.partPreset.findMany({
    where: { congregationId, scope: PartPresetScope.Part },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      speakerLabel: true,
      readerLabel: true,
      hasReaderSlot: true,
      allowExternalSpeaker: true,
      shareMessage: true,
    },
  })

  return presets.map(({ shareMessage, ...preset }) => ({
    ...preset,
    hasShareMessage: shareMessage.trim() !== '',
  }))
}

/**
 * Full preset rows for the settings screens, with a usage count so the list can
 * show what each kind is applied to. The delete guard counts independently at
 * the moment of deletion — this figure is for display and may be stale by then.
 */
export function listPartPresetsForSettings(db: TransactionClient, congregationId: number) {
  return db.partPreset.findMany({
    where: { congregationId, scope: PartPresetScope.Part },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    // biome-ignore lint/style/useNamingConvention: _count is Prisma's own key
    include: { _count: { select: { templateParts: true, eventParts: true } } },
  })
}

/** Returns null when the preset does not exist in this congregation. */
export function getPartPresetById(db: TransactionClient, id: number, congregationId: number) {
  return db.partPreset.findFirst({ where: { id, congregationId } })
}
