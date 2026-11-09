import { Avatar, Panel, SectionHeading, Status, Tag } from '@unitae/ui'
import { useState } from 'react'
import { Link } from 'react-router'

import type { AttributionState } from '~/features/territories/model/attribution-list'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import type { Availability } from '~/features/territories/model/territory-availability'
import type { TerritoryHistoryEntry } from '~/features/territories/server/territory-page.queries'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { daysBetween } from '~/shared/utils/calendar-day'
import { shortDay } from '~/shared/utils/format-day'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { cn } from '~/shared/utils/utils'

import { availabilityLabel, dueText, holderName, STATE_TONE } from './attribution-labels'

/** The attribution open on the territory, with its state on today. */
export type CurrentAttribution = TerritoryHistoryEntry & { state: AttributionState }

const BAR: Record<AttributionState, string> = {
  'on-time': 'bg-chart-1',
  'due-soon': 'bg-warning',
  overdue: 'bg-danger',
  paused: 'bg-faint',
  orphaned: 'bg-danger',
}

interface TerritoryAttributionProps {
  current: CurrentAttribution | null
  /** The latest attribution rentré, to say who had it last. */
  last: TerritoryHistoryEntry | null
  availability: Availability
  today: string
  canManage: boolean
  canViewPublishers: boolean
  onReturn: () => void
  onEdit: () => void
  onAssign: () => void
}

/**
 * Who holds the territory: their name, the loan as a bar, when it comes back; « Rentrer… » and « Modifier
 * l'attribution » on the spot. A territory nobody holds says who had it last and whether it can go out, with
 * « Attribuer ».
 */
export function TerritoryAttribution(props: TerritoryAttributionProps) {
  const { current, today } = props
  return (
    <Panel
      title={m.territory_page_attribution_title()}
      actions={
        current != null && (
          <span className="text-faint text-sm tabular-nums">
            {m.territory_page_attribution_since({ date: shortDay(current.startDay, today) })}
          </span>
        )
      }
      padded
    >
      {current != null ? <Held {...props} current={current} /> : <Free {...props} />}
    </Panel>
  )
}

function Held({
  current,
  today,
  canManage,
  canViewPublishers,
  onReturn,
  onEdit,
}: TerritoryAttributionProps & { current: CurrentAttribution }) {
  const name = holderName(current.publisher)
  const total = Math.max(1, daysBetween(current.startDay, current.lateDay))
  const elapsed = Math.min(total, Math.max(0, daysBetween(current.startDay, today)))
  const details = [
    current.groupName != null ? formatGroupName(current.groupName) : null,
    current.campaign != null
      ? current.campaign.name
      : current.type === TerritoryAttributionKind.Phone
        ? m.territory_page_by_phone()
        : m.territory_page_door_to_door(),
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-2.5">
        <Avatar name={name} size="md" />
        <span className="flex min-w-0 flex-col">
          {canViewPublishers && !current.publisher.anonymized ? (
            <Link
              to={`/publishers/${current.publisher.id}/view`}
              className="font-medium text-brand-text underline-offset-4 hover:underline"
            >
              {name}
            </Link>
          ) : (
            <span className="font-medium">{name}</span>
          )}
          <span className="text-faint text-xs">{details.join(' · ')}</span>
        </span>
      </span>
      {current.state !== 'paused' && current.state !== 'orphaned' && (
        <span className="flex items-center gap-2.5 text-faint text-xs tabular-nums">
          <span>{shortDay(current.startDay, today)}</span>
          <span className="block h-1 flex-1 overflow-hidden rounded-full bg-hover" aria-hidden="true">
            <span
              className={cn('block h-full rounded-full', BAR[current.state])}
              style={{ width: `${(elapsed / total) * 100}%` }}
            />
          </span>
          <span>{shortDay(current.lateDay, today)}</span>
        </span>
      )}
      <Status tone={STATE_TONE[current.state]}>{dueText(current, today)}</Status>
      {canManage && (
        <span className="flex flex-wrap gap-2">
          {current.state !== 'paused' && (
            <Button type="button" variant="outline" size="sm" onClick={onReturn}>
              {m.attributions_row_return()}
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            {m.territory_page_edit_attribution()}
          </Button>
        </span>
      )}
    </div>
  )
}

function Free({ last, availability, today, canManage, onAssign }: TerritoryAttributionProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <Status tone="neutral">{availabilityLabel(availability, today)}</Status>
        <span className="text-muted-foreground text-sm">
          {last == null
            ? m.attributions_panel_never()
            : m.territory_page_last_returned({
                name: holderName(last.publisher),
                date: shortDay(last.endDay ?? last.startDay, today),
              })}
        </span>
      </span>
      {canManage && (
        <Button type="button" size="sm" onClick={onAssign}>
          {m.attributions_assign_row_button()}
        </Button>
      )}
    </div>
  )
}

/** The attributions of the territory, newest first: who, when, for how long; the oldest behind a button. */
export function TerritoryHistory({ entries, today }: { entries: TerritoryHistoryEntry[]; today: string }) {
  const [all, setAll] = useState(false)
  const shown = all ? entries : entries.slice(0, 4)
  const hidden = entries.length - shown.length

  return (
    <section className="flex flex-col">
      <SectionHeading
        title={m.territory_page_history_title()}
        meta={<span className="tabular-nums">{m.territory_page_history_count({ count: entries.length })}</span>}
      />
      {entries.length === 0 ? (
        <p className="py-3 text-muted-foreground text-sm">{m.attributions_panel_never()}</p>
      ) : (
        <ul className="divide-y divide-border border-border border-t">
          {shown.map(entry => (
            <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Avatar name={holderName(entry.publisher)} />
                <span className="truncate">{holderName(entry.publisher)}</span>
                {entry.campaign != null && <Tag>{entry.campaign.name}</Tag>}
                {entry.campaign == null && entry.type === TerritoryAttributionKind.Phone && (
                  <Tag>{m.attributions_tag_phone()}</Tag>
                )}
              </span>
              <span className="text-faint tabular-nums">{historySpan(entry, today)}</span>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="mt-1 self-start rounded-sm py-1 text-muted-foreground text-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {m.territory_page_history_more({ count: hidden })}
        </button>
      )}
    </section>
  )
}

/** « 2 mars → 21 mars · 19 jours », or « depuis le 16 juil. » while it is out. */
function historySpan(entry: TerritoryHistoryEntry, today: string): string {
  if (entry.endDay == null) return m.territory_page_history_open({ date: shortDay(entry.startDay, today) })
  const days = Math.max(1, daysBetween(entry.startDay, entry.endDay))
  return `${shortDay(entry.startDay, today)} → ${shortDay(entry.endDay, today)} · ${durationLabel(days)}`
}

/** « 19 jours », « 5 semaines », « 4 mois »: the length of a loan as people say it. */
export function durationLabel(days: number): string {
  if (days < 14) return days === 1 ? m.territory_page_days_one() : m.territory_page_days_other({ count: days })
  if (days < 60) return m.territory_page_weeks({ count: Math.round(days / 7) })
  return m.territory_page_months({ count: Math.round(days / 30.44) })
}
