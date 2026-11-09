import { Calendar, Megaphone, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { cn } from '~/shared/utils/utils'

export interface CampaignBannerData {
  id: number
  name: string
  startDate: string | Date
  endDate: string | Date
  status: 'active' | 'scheduled'
  /** Its last day, worded on the server in the zone its dates were saved in. */
  endLabel?: string
}

function dismissalKey(campaign: CampaignBannerData): string {
  return `campaign-banner-dismissed-${campaign.id}-${campaign.status}`
}

/**
 * Territories-scoped banner while a campaign is active (brand tint — a mode
 * change, not an error) or scheduled (neutral). Copy is permission-aware; the
 * dismissal is client-side only (sessionStorage per campaign) and comes back
 * in a new browsing session — it's a contextual reminder, not a preference.
 */
export function CampaignModeBanner({
  campaign,
  variant,
}: {
  campaign: CampaignBannerData | null
  variant: 'manager' | 'publisher'
}) {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (campaign != null) setDismissed(sessionStorage.getItem(dismissalKey(campaign)) != null)
  }, [campaign])

  if (campaign == null || dismissed) return null
  // Publishers only need the active-mode message; the scheduled details are
  // management information.
  if (variant === 'publisher' && campaign.status !== 'active') return null

  const start = new Date(campaign.startDate).toLocaleDateString(getLocale())
  const end = new Date(campaign.endDate).toLocaleDateString(getLocale())

  const isActive = campaign.status === 'active'
  const Icon = isActive ? Megaphone : Calendar

  // A scheduled campaign whose start day has arrived is waiting for the next
  // lifecycle pass — announcing a past "start" date would read as nonsense.
  const startsToday = new Date(campaign.startDate).getTime() <= Date.now()
  const message = !isActive
    ? startsToday
      ? m.campaign_banner_starting({ name: campaign.name })
      : m.campaign_banner_scheduled({ name: campaign.name, start })
    : variant === 'manager'
      ? m.campaign_banner_active_manager({ name: campaign.name, start, end })
      : m.campaign_banner_active_publisher_until({ name: campaign.name, end: campaign.endLabel ?? end })

  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-2.5 rounded-lg py-1.5 pr-1.5 pl-3.5 text-sm',
        isActive ? 'bg-brand-soft' : 'border border-border bg-sidebar',
      )}
    >
      <Icon aria-hidden="true" className={cn('size-4 shrink-0', isActive ? 'text-brand-text' : 'text-faint')} />
      <span className="flex-1">
        {message}
        {variant === 'manager' && (
          <>
            {' '}
            <Link
              to={`/territories/attributions/campaigns/${campaign.id}`}
              className="font-medium text-brand-text underline underline-offset-4"
            >
              {m.campaign_banner_manage_link()}
            </Link>
          </>
        )}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={m.campaign_banner_dismiss()}
        className="shrink-0 text-muted-foreground"
        onClick={() => {
          sessionStorage.setItem(dismissalKey(campaign), '1')
          setDismissed(true)
        }}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  )
}
