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
