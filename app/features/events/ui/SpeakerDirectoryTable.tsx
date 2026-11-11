import { Avatar, Status, Tag } from '@unitae/ui'
import { ChevronRight, Mail } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link } from 'react-router'
import type { DirectorySpeaker } from '~/features/events/model/external-speaker.type'
import { formatSpeakerDate, formatVisitDay, visitAgo } from '~/features/events/model/speaker-dates'
import {
  isIncomplete,
  isListStale,
  isResponsible,
  type SpeakerGroup,
  type SpeakerView,
} from '~/features/events/model/speaker-directory'
import * as m from '~/i18n/paraglide/messages'
import { openRowOnClick } from '~/shared/ui/row-click'
import { cn } from '~/shared/utils/utils'

const HEAD = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const CELL = 'border-border border-b px-3.5 py-1.5 text-sm'
const SHOWN_TALKS = 5
// A row action shown on hover or focus, always on a touch screen: the list stays quiet, as in Linear.
const REVEAL =
  'opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none'

function Talks({ talks }: { talks: number[] }) {
  if (talks.length === 0) return <span className="text-faint">—</span>
  return (
    <span className="text-muted-foreground whitespace-nowrap tabular-nums">
      {talks.slice(0, SHOWN_TALKS).join(' · ')}
      {talks.length > SHOWN_TALKS && <span className="text-faint"> +{talks.length - SHOWN_TALKS}</span>}
    </span>
  )
}

/** One line, so every row keeps its 40 px: the date, then a quiet aside. */
function OneLine({ main, aside }: { main: string; aside?: string }) {
  return (
    <span className="whitespace-nowrap tabular-nums">
      {main}
      {aside && <span className="text-faint"> · {aside}</span>}
    </span>
  )
}

function SpeakerRow({
  speaker,
  group,
  view,
  wide,
  selected,
  timezone,
  onOpen,
}: {
  speaker: DirectorySpeaker
  group: SpeakerGroup
  view: SpeakerView
  wide: boolean
  selected: boolean
  timezone: string
  onOpen: (speaker: DirectorySpeaker, trigger: HTMLElement) => void
}) {
  const phone = speaker.phone ?? speaker.phone2
  const hasMail = speaker.email != null || speaker.email2 != null
  const last =
    view === 'retired' && speaker.retiredAt != null ? (
      <OneLine
        main={m.external_speakers_retired_on({ date: formatSpeakerDate(speaker.retiredAt, timezone) })}
        aside={
          speaker.lastVisit
            ? m.external_speakers_last_visit_on({ date: formatSpeakerDate(speaker.lastVisit, timezone) })
            : undefined
        }
      />
    ) : speaker.lastVisit ? (
      <OneLine main={formatSpeakerDate(speaker.lastVisit, timezone)} aside={visitAgo(speaker.lastVisit)} />
    ) : (
      <span className="text-muted-foreground">{m.external_speakers_never_came()}</span>
    )
  return (
    <tr
      onClick={openRowOnClick}
      data-selected={selected || undefined}
      className={cn('hover:bg-hover cursor-pointer transition-colors', selected && 'bg-selected hover:bg-selected')}
    >
      <td className={cn(CELL, 'h-10')}>
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={speaker.name} size="sm" />
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                data-row-primary
                className="truncate text-left font-medium outline-none focus-visible:underline"
                onClick={event => onOpen(speaker, event.currentTarget)}
              >
                {speaker.name}
              </button>
              {isIncomplete(speaker) && view === 'list' && (
                <Status tone="warning" className="shrink-0 whitespace-nowrap">
                  {m.external_speakers_tag_incomplete()}
                </Status>
              )}
              {isResponsible(speaker, group.congregation) && (
                <Tag className="shrink-0 whitespace-nowrap max-sm:hidden">{m.external_speakers_tag_responsible()}</Tag>
              )}
            </span>
            <span className="text-xs md:hidden">
              <Talks talks={speaker.talks} />
            </span>
          </span>
        </span>
      </td>
      <td className={cn(CELL, 'max-md:hidden')}>
        <Talks talks={speaker.talks} />
      </td>
      {wide && (
        <td className={cn(CELL, 'max-lg:hidden')}>
          <span className="text-muted-foreground flex items-center gap-2 whitespace-nowrap">
            {phone && <span className="tabular-nums">{phone}</span>}
            {hasMail && (
              <Mail role="img" aria-label={m.external_speakers_has_email()} className="text-faint size-3.5" />
            )}
            {!phone && !hasMail && <span className="text-faint">—</span>}
          </span>
        </td>
      )}
      <td className={CELL}>{last}</td>
      <td className={cn(CELL, 'max-md:hidden')}>
        {speaker.nextVisit && view === 'list' && (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="tabular-nums">{formatVisitDay(speaker.nextVisit.date, timezone)}</span>
            <Status tone={speaker.nextVisit.status === 'draft' ? 'warning' : 'success'}>
              {speaker.nextVisit.status === 'draft'
                ? m.external_speakers_status_draft()
                : m.external_speakers_status_released()}
            </Status>
          </span>
        )}
      </td>
    </tr>
  )
}

export function SpeakerDirectoryTable({
  groups,
  view,
  wide,
  selectedSpeakerId,
  selectedCongregationId,
  canManage,
  timezone,
  onOpenSpeaker,
  onOpenCongregation,
}: {
  groups: SpeakerGroup[]
  view: SpeakerView
  /** No panel open: room for the contact column. */
  wide: boolean
  selectedSpeakerId: number | null
  selectedCongregationId: number | null
  canManage: boolean
  timezone: string
  onOpenSpeaker: (speaker: DirectorySpeaker, trigger: HTMLElement) => void
  onOpenCongregation: (id: number, trigger: HTMLElement) => void
}) {
  const [folded, setFolded] = useState<Record<string, boolean>>({})
  const columns = wide ? 5 : 4
  return (
    <div className="border-border bg-card overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={HEAD}>{m.external_speakers_col_speaker()}</th>
            <th className={cn(HEAD, 'max-md:hidden')}>{m.external_speakers_col_talks()}</th>
            {wide && <th className={cn(HEAD, 'max-lg:hidden')}>{m.external_speakers_col_contact()}</th>}
            <th className={HEAD}>{m.external_speakers_col_last_visit()}</th>
            <th className={cn(HEAD, 'max-md:hidden')}>{m.external_speakers_col_next_visit()}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(group => {
            const key = String(group.congregation?.id ?? 'none')
            const open = !folded[key]
            const name = group.congregation?.name ?? m.external_speakers_group_none()
            const count =
              group.speakers.length === 1
                ? m.external_speakers_count_one()
                : m.external_speakers_count_many({ count: String(group.speakers.length) })
            const congregation = group.congregation
            return (
              <Fragment key={key}>
                <tr className="group/row">
                  <td
                    colSpan={columns}
                    className={cn(
                      'border-border bg-sidebar h-9 border-b px-3 py-0',
                      congregation != null && congregation.id === selectedCongregationId && 'bg-selected',
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-label={m.external_speakers_group_toggle({ name })}
                        onClick={() => setFolded(previous => ({ ...previous, [key]: open }))}
                        className="text-faint inline-grid size-6 place-content-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ChevronRight
                          aria-hidden="true"
                          className={cn(
                            'size-4 transition-transform motion-reduce:transition-none',
                            open && 'rotate-90',
                          )}
                        />
                      </button>
                      {congregation ? (
                        <button
                          type="button"
                          className="font-semibold underline-offset-3 hover:underline"
                          onClick={event => onOpenCongregation(congregation.id, event.currentTarget)}
                        >
                          {name}
                        </button>
                      ) : (
                        <span className="font-semibold">{name}</span>
                      )}
                      <span className="text-faint tabular-nums">{count}</span>
                      {congregation?.listDate && (
                        <span className="text-faint max-sm:hidden">
                          ·{' '}
                          {m.external_speakers_group_list_date({
                            date: formatSpeakerDate(congregation.listDate, timezone),
                          })}
                        </span>
                      )}
                      {congregation && isListStale(congregation.listDate) && (
                        <Status tone="warning" className="max-sm:hidden">
                          {m.external_speakers_group_stale()}
                        </Status>
                      )}
                      {congregation == null && (
                        <span className="text-faint max-sm:hidden">· {m.external_speakers_group_none_hint()}</span>
                      )}
                      <span className="flex-1" />
                      {congregation && canManage && view === 'list' && (
                        <Link
                          to={`/programs/external-speakers/congregations/${congregation.id}/update`}
                          className={cn(
                            'text-muted-foreground hover:text-foreground font-medium underline-offset-4 hover:underline max-md:hidden',
                            REVEAL,
                          )}
                        >
                          {m.external_speakers_update_list()}
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
                {open &&
                  group.speakers.map(speaker => (
                    <SpeakerRow
                      key={speaker.id}
                      speaker={speaker}
                      group={group}
                      view={view}
                      wide={wide}
                      selected={speaker.id === selectedSpeakerId}
                      timezone={timezone}
                      onOpen={onOpenSpeaker}
                    />
                  ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
