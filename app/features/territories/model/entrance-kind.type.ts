import { EntranceKind } from '~/database/generated/enums'
import * as m from '~/paraglide/messages'

export { EntranceKind }

export function entranceKindLabels(): Record<EntranceKind, string> {
  return {
    [EntranceKind.Residential]: m.entrance_kind_residential(),
    [EntranceKind.Commerce]: m.entrance_kind_commerce(),
    [EntranceKind.Hotel]: m.entrance_kind_hotel(),
    [EntranceKind.Laundromat]: m.entrance_kind_laundromat(),
    [EntranceKind.Campus]: m.entrance_kind_campus(),
  }
}
