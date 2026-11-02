import { CheckCircle2, Circle, KeyRound, MapPin, User, Users, UsersRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useFetcher } from 'react-router'

import type { OnboardingSteps } from '~/features/dashboard/server/get-onboarding-progress.server'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Progress } from '~/shared/ui/progress'

// The checklist used to be dismissed per browser, under this key. Removable once the carry-over
// below has been live long enough for returning admins to have loaded the dashboard once.
const LEGACY_DISMISSED_KEY = 'unitae:onboarding-dismissed'

interface OnboardingChecklistProps {
  steps: OnboardingSteps
  accountId: number
}

export function OnboardingChecklist({ steps, accountId }: OnboardingChecklistProps) {
  const fetcher = useFetcher()
  const { submit } = fetcher
  const [legacyDismissed, setLegacyDismissed] = useState(false)

  // A browser that still holds the old per-browser flag closes the checklist for the account,
  // once, so admins who already dismissed it don't see it come back.
  useEffect(() => {
    try {
      if (localStorage.getItem(LEGACY_DISMISSED_KEY) !== 'true') return
      localStorage.removeItem(LEGACY_DISMISSED_KEY)
    } catch {
      return
    }
    setLegacyDismissed(true)
    submit(null, { method: 'post', action: '/onboarding/dismiss' })
  }, [submit])

  // Hidden as soon as the close is posted; the loader stops returning it once that lands.
  if (legacyDismissed || fetcher.state !== 'idle' || fetcher.data != null) return null

  const items = [
    {
      done: steps.ownRecord,
      label: m.onboarding_create_own_record(),
      icon: User,
      // Once linked, the creation form would only bounce: lead to the profile instead.
      to: steps.ownRecord ? '/me/profile' : `/settings/users/${accountId}/add-to-congregation?returnTo=/`,
    },
    { done: steps.publishers, label: m.onboarding_add_publishers(), icon: Users, to: '/publishers' },
    { done: steps.groups, label: m.onboarding_create_groups(), icon: UsersRound, to: '/groups' },
    { done: steps.logins, label: m.onboarding_give_access(), icon: KeyRound, to: '/settings/users' },
    { done: steps.territories, label: m.onboarding_add_territories(), icon: MapPin, to: '/territories' },
  ]
  const doneCount = items.filter(item => item.done).length

  return (
    <Card className="animate-fade-in-up border-primary/20 bg-primary/5">
      <CardHeader>
        <div>
          <CardTitle className="text-base">{m.onboarding_title()}</CardTitle>
          <p className="mt-0.5 text-muted-foreground text-sm">{m.onboarding_description()}</p>
        </div>
        <CardAction>
          <fetcher.Form method="post" action="/onboarding/dismiss">
            <Button type="submit" variant="ghost" size="icon-xs">
              <X className="size-3.5" />
              <span className="sr-only">{m.onboarding_dismiss()}</span>
            </Button>
          </fetcher.Form>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Progress value={(doneCount / items.length) * 100} aria-label={m.onboarding_title()} className="max-w-xs" />
          <span className="text-muted-foreground text-xs tabular-nums">
            {m.onboarding_progress({ done: String(doneCount), total: String(items.length) })}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {items.map(item => (
            <Link
              key={item.label}
              to={item.to}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-primary/10"
            >
              {item.done ? (
                <CheckCircle2 className="size-4 shrink-0 text-green-600 dark:text-green-400" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" />
              )}
              <item.icon className="size-4 shrink-0 text-muted-foreground" />
              <span className={`text-sm ${item.done ? 'text-muted-foreground line-through' : 'font-medium'}`}>
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
