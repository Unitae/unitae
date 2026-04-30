import { EntranceKind } from '~/database/generated/enums'
import * as m from '~/paraglide/messages'

export { EntranceKind }

// biome-ignore lint/style/useNamingConvention: labels map keyed by enum
export function entranceKindLabels(): { [key in EntranceKind]: string } {
  return {
    [EntranceKind.Residential]: m.entrance_kind_residential(),
    [EntranceKind.Commerce]: m.entrance_kind_commerce(),
    [EntranceKind.Hotel]: m.entrance_kind_hotel(),
    [EntranceKind.Laundromat]: m.entrance_kind_laundromat(),
    [EntranceKind.Campus]: m.entrance_kind_campus(),
  }
}
