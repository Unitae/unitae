import { Tag } from '@unitae/ui'

import type { CampaignStatus } from '~/features/territories/model/campaign-status'
import * as m from '~/i18n/paraglide/messages'

/** A campaign's state beside its name: running in the accent, planned quiet, ended quieter still. */
export function CampaignStateTag({ status }: { status: CampaignStatus }) {
  if (status === 'active') {
    return (
      <Tag tone="brand" className="gap-1.5">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
        {m.campaigns_tag_active()}
      </Tag>
    )
  }
  if (status === 'scheduled') return <Tag>{m.campaigns_tag_scheduled()}</Tag>
  return <span className="text-faint text-sm">{m.campaigns_tag_ended()}</span>
}
