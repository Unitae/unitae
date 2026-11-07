import { StatusIcon, Tag } from '@unitae/ui'
import { CalendarPlus } from 'lucide-react'
import { Link } from 'react-router'

import type { OpenSlots } from '~/features/dashboard/server/get-open-parts.server'
import {
  DashboardSection,
  PanelError,
  panelLinkRowClass,
  SectionAction,
} from '~/features/dashboard/ui/DashboardSection'
import { dateChip } from '~/features/dashboard/ui/dashboard-format'
import * as m from '~/i18n/paraglide/messages'

interface ProgrammesSectionProps {
  open: { data: OpenSlots[] | null }
  canCreate: boolean
  timeZone: string
}

/**
 * « Programmes », for those who fill them: coming meetings that still have empty slots, drafts
 * included since that is where slots get filled. Each row opens the meeting's editor.
 */
export function ProgrammesSection({ open, canCreate, timeZone }: ProgrammesSectionProps) {
  const slots = open.data
  return (
    <DashboardSection
      title={m.dashboard_programmes_title()}
      meta={m.dashboard_programmes_meta()}
      link={{ to: '/programs', label: m.dashboard_programmes_link() }}
      actions={
        canCreate ? (
          <SectionAction to="/programs/new" icon={CalendarPlus} label={m.dashboard_quick_action_new_program()} />
        ) : undefined
      }
    >
      {slots == null ? (
        <PanelError />
      ) : slots.length === 0 ? (
        <p className="flex items-center gap-2.5 px-3.5 py-3 text-muted-foreground text-sm">
          <StatusIcon tone="success" />
          {m.dashboard_programmes_all_filled()}
        </p>
      ) : (
        slots.map(slot => {
          const chip = dateChip(slot.startDate, timeZone)
          return (
            <Link key={slot.eventId} to={`/programs/events/${slot.eventId}`} className={panelLinkRowClass}>
              <span className="w-14 shrink-0 text-faint text-xs tabular-nums">
                {chip.weekday} {chip.day}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{slot.name}</span>
              {slot.isDraft && <Tag className="shrink-0">{m.dashboard_programmes_draft()}</Tag>}
              <span className="flex shrink-0 items-center gap-1.5 text-sm">
                <StatusIcon tone="neutral" />
                {m.dashboard_programmes_open({ count: String(slot.count) })}
              </span>
            </Link>
          )
        })
      )}
    </DashboardSection>
  )
}
