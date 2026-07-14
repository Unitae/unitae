import type { BboxEntrance } from '~/features/territories/server/buildings.server'
import type { EntrancePinVariant } from '~/features/territories/ui/EntranceMarkerPin'
import type { EntrancePendingState } from '~/features/territories/ui/EntrancePopup'

export function pinVariantFor(entrance: BboxEntrance, pending: EntrancePendingState): EntrancePinVariant {
  if (pending === 'pending-remove') return 'pending-remove'
  if (pending === 'pending-add' || pending === 'pending-reassign' || pending === 'pending-select') return 'pending-add'
  if (entrance.status === 'in-this-territory') return 'in-territory'
  if (entrance.status === 'available') return 'available'
  return 'on-other'
}
