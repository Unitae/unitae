import { Calendar, CheckCircle2, Megaphone } from 'lucide-react'
import type { CampaignStatus } from '~/features/territories/model/campaign-status'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'

export function CampaignStatusBadge({ status, className }: { status: CampaignStatus; className?: string }) {
  if (status === 'active') {
    return (
      <Badge variant="warning" className={className}>
        <Megaphone />
        {m.campaigns_status_active()}
      </Badge>
    )
  }
  if (status === 'scheduled') {
    return (
      <Badge variant="info" className={className}>
        <Calendar />
        {m.campaigns_status_scheduled()}
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className={className}>
      <CheckCircle2 />
      {m.campaigns_status_ended()}
    </Badge>
  )
}
