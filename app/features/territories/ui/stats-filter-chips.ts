import type { PublisherGroup } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { formatGroupName } from '~/shared/utils/format-group-name'

export type ChipTone = 'window' | 'kind' | 'attribution' | 'group'

export interface StatsFilterChip {
  key: string
  label: string
  tone: ChipTone
}

export interface BuildStatsFilterChipsInput {
  startDate: string
  endDate: string
  kinds: string[]
  attributionKinds: string[]
  groupId: string | null
  groups: PublisherGroup[]
  phoneTypeActive: boolean
}

function territoryKindLabel(kind: string): string {
  switch (kind) {
    case TerritoryKind.Classical:
      return m.stats_filter_territory_door()
    case TerritoryKind.Phone:
      return m.stats_filter_territory_phone()
    case TerritoryKind.Commerces:
      return m.stats_filter_territory_commerce()
    case TerritoryKind.Hotel:
      return m.stats_filter_territory_hotel()
    case TerritoryKind.Univ:
      return m.stats_filter_territory_university()
    default:
      return kind
  }
}

function attributionLabel(attribution: string, phoneTypeActive: boolean): string {
  switch (attribution) {
    case TerritoryAttributionKind.Campaign:
      return m.stats_filter_badge_campaign()
    case TerritoryAttributionKind.Default:
      return phoneTypeActive ? m.stats_filter_badge_door_classic() : m.stats_filter_badge_door()
    case TerritoryAttributionKind.Phone:
      return m.stats_filter_badge_phone()
    default:
      return attribution
  }
}

export function buildStatsFilterChips(input: BuildStatsFilterChipsInput): StatsFilterChip[] {
  const chips: StatsFilterChip[] = []

  const start = new Date(input.startDate).toLocaleDateString('fr-FR')
  const end = new Date(input.endDate).toLocaleDateString('fr-FR')
  chips.push({ key: 'window', tone: 'window', label: `${start} - ${end}` })

  const isAllTypes = input.kinds.length === 0 || input.kinds.includes('none')
  if (isAllTypes) {
    chips.push({ key: 'kind-all', tone: 'kind', label: m.stats_filter_territory_all_types() })
  } else {
    for (const kind of input.kinds) {
      chips.push({ key: `kind-${kind}`, tone: 'kind', label: territoryKindLabel(kind) })
    }
  }

  for (const attribution of input.attributionKinds) {
    chips.push({
      key: `attribution-${attribution}`,
      tone: 'attribution',
      label: attributionLabel(attribution, input.phoneTypeActive),
    })
  }

  if (input.groupId != null && input.groupId !== 'none') {
    const found = input.groups.find(g => g.id === Number(input.groupId))
    const groupName = found ? formatGroupName(found.name) : ''
    chips.push({
      key: `group-${input.groupId}`,
      tone: 'group',
      label: m.stats_filter_badge_group({ group: groupName }),
    })
  }

  return chips
}

export const chipToneClassName: Record<ChipTone, string> = {
  window: 'border-primary text-primary',
  kind: 'border-orange-500 text-orange-500',
  attribution: 'border-amber-500 text-amber-500',
  group: 'border-violet-500 text-violet-500',
}
