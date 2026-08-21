import { PartPresetScope } from '~/features/events/model/part-preset.type'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * The presets offered when choosing what kind a programme part is.
 *
 * Selects only id and name: the picker never renders a share message, and the
 * bodies are long enough that shipping them to the client on every programme
 * edit would be pure waste.
 */
export function listPartPresets(db: TransactionClient, congregationId: number) {
  return db.partPreset.findMany({
    where: { congregationId, scope: PartPresetScope.Part },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
}

/**
 * Full preset rows for the settings screens, with a usage count so the list can
 * show what each kind is applied to and the delete guard has something to
 * explain itself with.
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
