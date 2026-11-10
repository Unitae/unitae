import type { StatusTone } from '@unitae/ui'
import * as m from '~/i18n/paraglide/messages'
import type { BuildingCheckReason, BuildingState } from '../model/building-list'
import { TerritoryAccess } from '../model/territory-access.type'
import type { BuildingContent, BuildingListRow } from '../server/building-list.queries'

export const BUILDING_STATE_TONE: Record<BuildingState, StatusTone> = {
  done: 'success',
  todo: 'warning',
  off: 'neutral',
}

/** The shape's words: up to date, to survey, or why it is not worked (inactive first, then outside the territory). */
export function buildingStateLabel(row: Pick<BuildingListRow, 'state' | 'active'>): string {
  if (row.state === 'done') return m.prospection_state_done()
  if (row.state === 'todo') return m.prospection_state_todo()
  return row.active ? m.prospection_state_outside() : m.prospection_state_inactive()
}

export function accessLabel(access: number | null): string | null {
  if (access === TerritoryAccess.Intercom) return m.prospection_entrance_access_intercom()
  if (access === TerritoryAccess.Doorbell) return m.prospection_entrance_access_doorbell()
  if (access === TerritoryAccess.Code) return m.prospection_entrance_access_digicode()
  return null
}

/** « 24 foyers · Interphone », « 3 commerces », « Hôtel »; null when nothing is known yet. */
export function buildingContentLabel(content: BuildingContent): string | null {
  const parts: string[] = []
  if (content.homes > 0) {
    parts.push(
      content.homes === 1 ? m.prospection_content_home() : m.prospection_content_homes({ count: content.homes }),
    )
  } else if (content.phones > 0) {
    parts.push(
      content.phones === 1 ? m.prospection_content_phone() : m.prospection_content_phones({ count: content.phones }),
    )
  }
  const access = accessLabel(content.access)
  if (parts.length > 0 && access) parts.push(access)
  if (content.commerces > 0) {
    parts.push(
      content.commerces === 1
        ? m.prospection_content_shop()
        : m.prospection_content_shops({ count: content.commerces }),
    )
  }
  if (content.hotels > 0) parts.push(m.prospection_content_hotel())
  if (content.campuses > 0) parts.push(m.prospection_content_campus())
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Whole months from `from` to `to`: 3 March to 2 April is 0, to 3 April is 1. */
export function monthsBetween(from: Date, to: Date): number {
  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  return to.getUTCDate() < from.getUTCDate() ? months - 1 : months
}

export function buildingReasonLabel(reason: BuildingCheckReason, prospectionDate: Date | null, today: Date): string {
  switch (reason) {
    case 'never-prospected':
      return m.prospection_reason_never()
    case 'stale':
      return prospectionDate
        ? m.prospection_reason_stale({ months: monthsBetween(prospectionDate, today) })
        : m.prospection_reason_never()
    case 'homes-missing':
      return m.prospection_reason_homes()
    case 'phones-missing':
      return m.prospection_reason_phones()
    case 'access-missing':
      return m.prospection_reason_access()
    case 'outside-territory':
      return m.prospection_reason_outside()
    case 'reactivate':
      return m.prospection_reason_reactivate()
  }
}
