import { KeyRound, MapPin, ShieldCheck, User, Users, UsersRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useFetcher } from 'react-router'

import type { PersonalStep, SetupStep } from '~/features/dashboard/server/load-dashboard.server'
import { DashboardSection, panelLinkRowClass } from '~/features/dashboard/ui/DashboardSection'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

// The checklist used to be dismissed per browser, under this key. Removable once the carry-over
// below has been live long enough for returning admins to have loaded the dashboard once.
const LEGACY_DISMISSED_KEY = 'unitae:onboarding-dismissed'

interface SetupChecklistProps {
  admin: SetupStep[] | null
  personal: PersonalStep[]
  accountId: number
}

function setupStep(step: SetupStep, accountId: number) {
  switch (step) {
    case 'ownRecord':
      return {
        label: m.onboarding_create_own_record(),
        icon: User,
        to: `/settings/users/${accountId}/add-to-congregation?returnTo=/`,
      }
    case 'publishers':
      return { label: m.onboarding_add_publishers(), icon: Users, to: '/publishers' }
    case 'groups':
      return { label: m.onboarding_create_groups(), icon: UsersRound, to: '/groups' }
    case 'logins':
      return { label: m.onboarding_give_access(), icon: KeyRound, to: '/settings/users' }
    case 'territories':
      return { label: m.onboarding_add_territories(), icon: MapPin, to: '/territories' }
  }
}

const PERSONAL_STEPS: Record<PersonalStep, { label: () => string; icon: typeof User; to: string }> = {
  'two-factor': { label: m.dashboard_setup_two_factor, icon: ShieldCheck, to: '/me/security' },
}

/**
 * « Premiers pas »: only what is still to do — the congregation's setup for the administrator,
 * two-factor sign-in for anyone holding a responsibility. Done steps never come back.
 */
export function SetupChecklist({ admin, personal, accountId }: SetupChecklistProps) {
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

  const steps = [
    ...(admin ?? []).map(step => ({ key: step, ...setupStep(step, accountId) })),
    ...personal.map(step => ({ key: step, ...PERSONAL_STEPS[step], label: PERSONAL_STEPS[step].label() })),
  ]

  return (
    <DashboardSection
      title={m.onboarding_title()}
      meta={m.dashboard_setup_description()}
      actions={
        <fetcher.Form method="post" action="/onboarding/dismiss">
          <Button type="submit" variant="ghost" size="icon-xs">
            <X />
            <span className="sr-only">{m.onboarding_dismiss()}</span>
          </Button>
        </fetcher.Form>
      }
    >
      {steps.map(step => (
        <Link key={step.key} to={step.to} className={panelLinkRowClass}>
          <step.icon aria-hidden="true" className="size-4 shrink-0 text-faint" />
          <span className="text-sm">{step.label}</span>
        </Link>
      ))}
    </DashboardSection>
  )
}
