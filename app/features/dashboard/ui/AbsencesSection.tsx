import { CalendarOff, CalendarPlus, Info } from 'lucide-react'
import { Link } from 'react-router'

import type { getUpcomingAbsences } from '~/features/dashboard/server/dashboard.server'
import {
  DashboardSection,
  PanelEmpty,
  PanelError,
  panelLinkRowClass,
  SectionAction,
} from '~/features/dashboard/ui/DashboardSection'
import { absenceDays, absenceLength, formatAbsencePeriod } from '~/features/events'
import * as m from '~/i18n/paraglide/messages'

type Absences = Awaited<ReturnType<typeof getUpcomingAbsences>>['upcoming']

/** The viewer's planned absences, with a nudge when the next two months look empty. */
export function AbsencesSection({
  absences,
  shouldNudge,
  timeZone,
}: {
  absences: Absences | null
  shouldNudge: boolean
  timeZone: string
}) {
  const hasItems = absences != null && absences.length > 0
  return (
    <DashboardSection
      title={m.dashboard_my_absences()}
      link={hasItems ? { to: '/me/days-off', label: m.dashboard_absences_link() } : undefined}
      // The one way to plan an absence on the page.
      actions={<SectionAction to="/me/days-off/new" icon={CalendarPlus} label={m.dashboard_absences_plan()} />}
    >
      {absences == null ? (
        <PanelError />
      ) : (
        <>
          {shouldNudge && (
            <p className="flex items-start gap-2.5 border-border border-b bg-brand-soft px-3.5 py-2.5 text-sm last:border-b-0">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-text" />
              {m.dashboard_absence_nudge()}
            </p>
          )}
          {absences.length === 0
            ? !shouldNudge && <PanelEmpty icon={CalendarOff} title={m.dashboard_no_absences()} />
            : absences.map(a => (
                <Link key={a.id} to="/me/days-off" className={panelLinkRowClass}>
                  <CalendarOff aria-hidden="true" className="size-4 shrink-0 text-faint" />
                  {/* As « Mes absences » writes it: the same absence reads the same everywhere. */}
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {formatAbsencePeriod(a.startDate, a.endDate, timeZone)}
                  </span>
                  <span className="shrink-0 text-faint text-sm tabular-nums">
                    {absenceLength(absenceDays(a.startDate, a.endDate, timeZone).count)}
                  </span>
                </Link>
              ))}
        </>
      )}
    </DashboardSection>
  )
}
