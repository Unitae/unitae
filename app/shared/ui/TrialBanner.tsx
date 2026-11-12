import { Callout } from '@unitae/ui'

import * as m from '~/i18n/paraglide/messages'
import type { TrialBannerInfo } from '~/shared/domain/trial-status'
import { Button } from '~/shared/ui/button'
import { STRIP } from '~/shared/ui/OfflineBanner'

// Shown at the top of every page while the congregation is in its SaaS trial; a warning in its last days.
export function TrialBanner({ trial }: { trial: TrialBannerInfo | null }) {
  if (trial == null) return null

  return (
    <Callout
      tone={trial.endingSoon ? 'warning' : 'info'}
      className={STRIP}
      title={
        trial.daysLeft === 1
          ? m.trial_banner_last_day()
          : m.trial_banner_days_left({ days: String(trial.daysLeft), date: trial.endsOn })
      }
      action={
        trial.subscribeUrl != null && (
          <Button asChild size="sm" variant={trial.endingSoon ? 'default' : 'outline'}>
            <a href={trial.subscribeUrl}>{m.trial_banner_subscribe()}</a>
          </Button>
        )
      }
    />
  )
}
