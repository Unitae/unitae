import { Clock } from 'lucide-react'

import * as m from '~/i18n/paraglide/messages'
import type { TrialBannerInfo } from '~/shared/domain/trial-status'
import { Button } from '~/shared/ui/button'
import { cn } from '~/shared/utils/utils'

// Shown at the top of every page while the congregation is in its SaaS trial.
export function TrialBanner({ trial }: { trial: TrialBannerInfo | null }) {
  if (trial == null) return null

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-sm',
        trial.endingSoon
          ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100'
          : 'bg-primary/10 text-foreground',
      )}
    >
      <span className="flex items-center gap-2">
        <Clock className="size-4 shrink-0" />
        {trial.daysLeft === 1
          ? m.trial_banner_last_day()
          : m.trial_banner_days_left({ days: String(trial.daysLeft), date: trial.endsOn })}
      </span>
      {trial.subscribeUrl != null && (
        <Button asChild size="sm" variant={trial.endingSoon ? 'default' : 'outline'} className="h-7">
          <a href={trial.subscribeUrl}>{m.trial_banner_subscribe()}</a>
        </Button>
      )}
    </div>
  )
}
