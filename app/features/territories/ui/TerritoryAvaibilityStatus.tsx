import { Pause } from 'lucide-react'
import type { Attribution } from '~/database/generated/client'
import { RESTING_PERIOD_DAYS } from '~/features/territories/model/resting-periods'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'

type AttributionWithCampaignRest = Attribution & { campaign?: { restPeriodDays: number | null } | null }

export function TerritoryAvaibilityStatus({ attribution }: { attribution?: AttributionWithCampaignRest }) {
  // Paused for the campaign: the territory is free to re-assign, but showing
  // why (its regular attribution is on hold) beats a plain « disponible ».
  if (attribution?.endDate == null && attribution?.pausedAt != null) {
    return (
      <Badge variant="secondary">
        <Pause />
        {m.attributions_paused_badge()}
      </Badge>
    )
  }

  const isAvailable = checkAvailabilityStatus(attribution)

  if (!isAvailable) {
    return (
      <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
        {m.attributions_availability_resting()}
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="border-blue-500 text-blue-500">
      {m.attributions_availability_available()}
    </Badge>
  )
}

export function checkAvailabilityStatus(attribution?: AttributionWithCampaignRest) {
  if (attribution == null) {
    return true
  }

  if (attribution.endDate == null) {
    // Open but paused (campaign hold) → free for campaign assignment;
    // open and actively worked → taken.
    return attribution.pausedAt != null
  }

  const restDays =
    attribution.campaignId != null
      ? (attribution.campaign?.restPeriodDays ?? RESTING_PERIOD_DAYS.campaign)
      : attribution.type === TerritoryAttributionKind.Default
        ? RESTING_PERIOD_DAYS.doorsToDoors
        : RESTING_PERIOD_DAYS.phone
  const restPeriod = restDays * 24 * 3600 * 1000
  const endRestPeriod = new Date()

  endRestPeriod.setTime(attribution.endDate.getTime() + restPeriod)

  return endRestPeriod < new Date()
}
