import type { EditorEntrance } from '~/features/territories/model/editor-entrance.type'
import { contentOf } from '~/features/territories/model/territory-draft'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'

/** « 12, 14 Rue Voltaire ». */
export function addressOf(entrance: Pick<EditorEntrance, 'address'>): string {
  return `${entrance.address.number} ${entrance.address.street}`
}

/** A territory's content in words, the way its type counts: « 163 foyers », « 40 numéros », « 6 commerces ». */
export function contentText(kind: TerritoryKindKey, count: number): string {
  if (kind === TerritoryKindKey.Phone) return m.territories_content_phones({ count })
  if (kind === TerritoryKindKey.Classical || kind === TerritoryKindKey.Univ) {
    return m.territories_content_homes({ count })
  }
  if (kind === TerritoryKindKey.Commerces) {
    return m.territories_content_commerces({ count })
  }
  if (kind === TerritoryKindKey.Hotel) {
    return m.territories_content_hotels({ count })
  }
  return m.territories_content_entrances({ count })
}

/** What a row's number counts, where the type counts something inside each entrance; nothing for shops. */
export function unitOf(kind: TerritoryKindKey): string | null {
  if (kind === TerritoryKindKey.Phone) return m.territory_editor_unit_phones()
  if (kind === TerritoryKindKey.Classical || kind === TerritoryKindKey.Univ) return m.territory_editor_unit_homes()
  return null
}

/** The number a row shows beside its address, under `unitOf`. */
export function rowCount(kind: TerritoryKindKey, entrance: EditorEntrance): number | null {
  return unitOf(kind) == null ? null : contentOf(kind, [entrance])
}

export function entrancesCount(count: number): string {
  return m.territory_editor_entrances_count({ count })
}

export function streetsCount(count: number): string {
  return m.territory_editor_streets_count({ count })
}
