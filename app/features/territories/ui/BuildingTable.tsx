import { StatusIcon, Tag } from '@unitae/ui'
import { ClipboardList } from 'lucide-react'
import { Link } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Checkbox } from '~/shared/ui/checkbox'
import { shortDay } from '~/shared/utils/format-day'
import { cn } from '~/shared/utils/utils'
import type { BuildingView } from '../model/building-list'
import type { BuildingListRow } from '../server/building-list.queries'
import { BuildingMenu } from './BuildingMenu'
import {
  BUILDING_STATE_TONE,
  buildingContentLabel,
  buildingReasonLabel,
  buildingStateLabel,
} from './building-list-labels'

const HEAD = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const CELL = 'h-10 whitespace-nowrap border-border border-b px-3.5 group-last:border-b-0'
const OPENER =
  'font-medium outline-none hover:underline hover:underline-offset-4 focus-visible:rounded-xs focus-visible:ring-2 focus-visible:ring-ring'

/** A row as the page receives it: days instead of instants, so every reader sees the same calendar day. */
export interface BuildingListItem extends Omit<BuildingListRow, 'prospectionDate' | 'createdAt'> {
  prospectionDay: string | null
  createdDay: string
}

/** The rows ticked for a bulk action (« Manquants », for who manages buildings). */
export interface BuildingSelection {
  ids: ReadonlySet<number>
  onToggle: (id: number) => void
  onToggleAll: (ids: number[]) => void
}

export interface BuildingTableProps {
  rows: BuildingListItem[]
  view: BuildingView
  today: string
  canSurvey: boolean
  /** Whether the reader may open the territory page; the territory is plain text otherwise. */
  canOpenTerritories: boolean
  canManage: boolean
  /** The list as it is (view, filters, order), so a survey opened from it can go on to the next building. */
  from: string
  selection?: BuildingSelection
}

/** Where « Prospecter » leads: the survey, told which list it came from. */
export function surveyHref(id: number, from: string): string {
  return `/territories/building/${id}/edit-prospection${from ? `?from=${encodeURIComponent(from)}` : ''}`
}

/**
 * One line per building: its state first, the address as it is said, what it holds (or, in « À vérifier », why it is
 * there), its territory and its last survey (« Ajouté » in « Nouveaux »). The address opens the building.
 */
export function BuildingTable(props: BuildingTableProps) {
  const { rows, view, selection } = props
  const allTicked = selection != null && rows.length > 0 && rows.every(row => selection.ids.has(row.id))
  return (
    <>
      <PhoneRows {...props} />
      <div className="overflow-x-auto rounded-lg border border-border bg-card max-md:hidden">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {selection && (
                <th className={cn(HEAD, 'w-10 pr-0')}>
                  <Checkbox
                    checked={allTicked}
                    onCheckedChange={() => selection.onToggleAll(rows.map(row => row.id))}
                    aria-label={m.prospection_select_all()}
                  />
                </th>
              )}
              <th className={HEAD}>{m.prospection_column_building()}</th>
              <th className={HEAD}>{view === 'check' ? m.prospection_column_why() : m.prospection_column_content()}</th>
              <th className={HEAD}>{m.prospection_column_territory()}</th>
              <th className={HEAD}>
                {view === 'new' ? m.prospection_column_added() : m.prospection_column_prospection()}
              </th>
              <th className={cn(HEAD, 'w-24')}>
                <span className="sr-only">{m.common_actions()}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <BuildingRow key={row.id} row={row} {...props} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function BuildingRow(props: BuildingTableProps & { row: BuildingListItem }) {
  const { row, view, today, canSurvey, canManage, from, selection } = props
  const ticked = selection?.ids.has(row.id) ?? false
  return (
    <tr
      data-testid="building-row"
      className={cn('group transition-colors duration-(--u-duration-fast) hover:bg-hover', ticked && 'bg-selected')}
    >
      {selection && (
        <td className={cn(CELL, 'w-10 pr-0')}>
          <Checkbox
            checked={ticked}
            onCheckedChange={() => selection.onToggle(row.id)}
            aria-label={m.prospection_select_building({ address: `${row.number} ${row.street}` })}
          />
        </td>
      )}
      <td className={CELL}>
        <Address row={row} />
      </td>
      <td className={cn(CELL, 'text-muted-foreground tabular-nums')}>
        {view === 'check' ? <Reasons row={row} today={today} /> : (buildingContentLabel(row.content) ?? '—')}
      </td>
      <td className={CELL}>
        <TerritoryLink row={row} canOpen={props.canOpenTerritories} />
      </td>
      <td className={cn(CELL, 'tabular-nums')}>
        <WhenCell row={row} view={view} today={today} />
      </td>
      <td className={cn(CELL, 'text-right')}>
        <span className="inline-flex items-center gap-1 opacity-0 transition-opacity duration-(--u-duration-fast) focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
          {canSurvey && (
            <Button asChild variant="ghost" size="icon-sm">
              <Link
                to={surveyHref(row.id, from)}
                aria-label={m.prospection_action_survey()}
                title={m.prospection_action_survey()}
              >
                <ClipboardList aria-hidden="true" />
              </Link>
            </Button>
          )}
          <BuildingMenu
            building={row}
            canSurvey={canSurvey}
            canManage={canManage}
            surveyTo={surveyHref(row.id, from)}
          />
        </span>
      </td>
    </tr>
  )
}

function Address({ row }: { row: BuildingListItem }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      <StatusIcon tone={BUILDING_STATE_TONE[row.state]} />
      <span className="sr-only">{buildingStateLabel(row)}</span>
      <Link to={`/territories/building/${row.id}/view`} className={OPENER}>
        {row.number} {row.street}
      </Link>
      <span className="text-faint text-sm tabular-nums">{row.zip}</span>
      {!row.hasPosition && (
        <span title={m.prospection_no_position_hint()}>
          <Tag>{m.prospection_no_position()}</Tag>
        </span>
      )}
    </span>
  )
}

function Reasons({ row, today }: { row: BuildingListItem; today: string }) {
  const prospected = row.prospectionDay ? new Date(`${row.prospectionDay}T12:00:00Z`) : null
  const labels = row.reasons.map(reason => buildingReasonLabel(reason, prospected, new Date(`${today}T12:00:00Z`)))
  if (labels.length === 0) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <Tag>{labels[0]}</Tag>
      {labels.length > 1 && (
        <span className="text-faint text-sm tabular-nums" title={labels.slice(1).join(' · ')}>
          +{labels.length - 1}
        </span>
      )}
    </span>
  )
}

function TerritoryLink({ row, canOpen }: { row: BuildingListItem; canOpen: boolean }) {
  if (row.territory == null) return <span className="text-faint">{m.prospection_no_territory()}</span>
  if (!canOpen) return <span className="tabular-nums">{row.territory.number}</span>
  return (
    <Link
      to={`/territories/territory/${row.territory.id}/view`}
      className="text-brand-text tabular-nums underline-offset-3 hover:underline"
    >
      {row.territory.number}
    </Link>
  )
}

/** The last survey, with « à refaire » once it is too old; the day the sync added it, in « Nouveaux ». */
function WhenCell({ row, view, today }: { row: BuildingListItem; view: BuildingView; today: string }) {
  if (view === 'new') return <span className="text-muted-foreground">{shortDay(row.createdDay, today)}</span>
  if (row.prospectionDay == null) return <span className="text-muted-foreground">{m.prospection_never()}</span>
  return (
    <span className="text-muted-foreground">
      {shortDay(row.prospectionDay, today)}
      {row.state === 'todo' && (
        <>
          <span className="text-faint"> · </span>
          <span className="text-warning-text">{m.prospection_redo()}</span>
        </>
      )}
    </span>
  )
}

/** On a phone, two lines per building: the state and the address, then why it is listed or what it holds. */
function PhoneRows({ rows, view, today }: BuildingTableProps) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
      {rows.map(row => (
        <li key={row.id} className="flex items-start gap-3 px-3.5 py-2.5">
          <StatusIcon tone={BUILDING_STATE_TONE[row.state]} className="mt-1" />
          <span className="sr-only">{buildingStateLabel(row)}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <Link to={`/territories/building/${row.id}/view`} className={cn(OPENER, 'truncate')}>
                {row.number} {row.street}
              </Link>
              <span className="text-faint text-sm tabular-nums">{row.zip}</span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-sm tabular-nums">
              {view === 'check' ? <Reasons row={row} today={today} /> : buildingContentLabel(row.content)}
              {row.territory && <span>{row.territory.number}</span>}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
