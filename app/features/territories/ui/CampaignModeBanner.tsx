import { Calendar, Megaphone, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import * as m from '~/i18n/paraglide/messages'

export interface CampaignBannerData {
  id: number
  name: string
  startDate: string | Date
  endDate: string | Date
  status: 'active' | 'scheduled'
}

function dismissalKey(campaign: CampaignBannerData): string {
  return `campaign-banner-dismissed-${campaign.id}-${campaign.status}`
}

/**
 * Territories-scoped banner while a campaign is active (amber — a mode
 * change, not an error) or scheduled (blue). Copy is permission-aware; the
 * dismissal is client-side only (localStorage per campaign) and reappears on
 * reload — it's a contextual reminder, not a preference.
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

  const start = new Date(campaign.startDate).toLocaleDateString('fr-FR')
  const end = new Date(campaign.endDate).toLocaleDateString('fr-FR')

  const isActive = campaign.status === 'active'
  const tone = isActive
    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
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
      : m.campaign_banner_active_publisher({ name: campaign.name })

  return (
    <div className={`flex items-center gap-2 rounded-md px-4 py-2.5 text-sm ${tone}`}>
      <Icon className="size-4 shrink-0" />
      <span className="flex-1">
        {message}
        {variant === 'manager' && (
          <>
            {' '}
            <Link
              to={`/territories/attributions/campaigns/${campaign.id}`}
              className="font-medium underline underline-offset-4"
            >
              {m.campaign_banner_manage_link()}
            </Link>
          </>
        )}
      </span>
      <button
        type="button"
        aria-label={m.campaign_banner_dismiss()}
        className="shrink-0 opacity-70 hover:opacity-100"
        onClick={() => {
          sessionStorage.setItem(dismissalKey(campaign), '1')
          setDismissed(true)
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
