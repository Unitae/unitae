import { Avatar, Status } from '@unitae/ui'
import { Fragment } from 'react'
import type { OurBrother } from '~/features/events/model/our-speaker.type'
import * as m from '~/i18n/paraglide/messages'
import { openRowOnClick } from '~/shared/ui/row-click'
import { cn } from '~/shared/utils/utils'

// The brothers of « Notre liste »: on it, or — in « Tous les candidats » — the candidates left off it, muted, in a
// group of their own. A row opens the brother beside the list.

const HEAD = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const CELL = 'border-border border-b px-3.5 py-2 text-sm align-top'

export type OurListView = 'on' | 'all'

function appointmentLabel(brother: OurBrother): string | null {
  if (brother.appointment === 'elder') return m.external_speakers_ours_elder()
  if (brother.appointment === 'servant') return m.external_speakers_ours_servant()
  return null
}

function Talks({ brother }: { brother: OurBrother }) {
  if (brother.talks.length > 0) {
    return <span className="text-muted-foreground tabular-nums">{brother.talks.join(' · ')}</span>
  }
  // Only a brother we send needs his talks: a candidate left off the list is not asked for them.
  if (!brother.onList) return <span className="text-faint">—</span>
  return (
    <Status tone="warning" className="whitespace-nowrap">
      {m.external_speakers_ours_talks_missing()}
    </Status>
  )
}

/** What the other congregations read of him: his phones then his e-mails, or why there is none. */
export function SharedContact({ brother, className }: { brother: OurBrother; className?: string }) {
  const { phones, emails } = brother.shared
  const quiet = 'text-faint'
  return (
    <span className={cn('flex min-w-0 flex-col', className)}>
      {phones.length > 0 ? (
        phones.map(phone => (
          <span key={phone} className="tabular-nums">
            {phone}
          </span>
        ))
      ) : (
        <span className={quiet}>
          {brother.phoneMode === 'hidden' ? m.external_speakers_ours_no_phone() : m.external_speakers_ours_phone_none()}
        </span>
      )}
      {emails.length > 0 ? (
        emails.map(email => (
          <span key={email} className="truncate">
            {email}
          </span>
        ))
      ) : (
        <span className={quiet}>
          {brother.emailMode === 'hidden'
            ? m.external_speakers_ours_email_hidden()
            : m.external_speakers_ours_no_email()}
        </span>
      )}
    </span>
  )
}

function BrotherRow({
  brother,
  selected,
  onOpen,
}: {
  brother: OurBrother
  selected: boolean
  onOpen: (brother: OurBrother, trigger: HTMLElement) => void
}) {
  const appointment = appointmentLabel(brother)
  return (
    <tr
      onClick={openRowOnClick}
      data-selected={selected || undefined}
      className={cn(
        'hover:bg-hover cursor-pointer transition-colors',
        selected && 'bg-selected hover:bg-selected',
        !brother.onList && 'text-muted-foreground',
      )}
    >
      <td className={CELL}>
        <span className="flex min-w-0 items-start gap-2.5">
          <Avatar name={brother.name} size="sm" />
          <span className="flex min-w-0 flex-col">
            <button
              type="button"
              data-row-primary
              className={cn('truncate text-left outline-none focus-visible:underline', brother.onList && 'font-medium')}
              onClick={event => onOpen(brother, event.currentTarget)}
            >
              {brother.name}
            </button>
            {appointment && <span className="text-faint text-xs">{appointment}</span>}
            {/* On a phone the talks ride under the name. */}
            <span className="mt-0.5 text-xs md:hidden">
              <Talks brother={brother} />
            </span>
          </span>
        </span>
      </td>
      <td className={cn(CELL, 'max-md:hidden')}>
        <Talks brother={brother} />
      </td>
      <td className={cn(CELL, 'max-md:hidden')}>
        <SharedContact brother={brother} className="text-muted-foreground" />
      </td>
    </tr>
  )
}

export function OurSpeakerTable({
  brothers,
  view,
  selectedId,
  onOpen,
}: {
  brothers: OurBrother[]
  view: OurListView
  selectedId: number | null
  onOpen: (brother: OurBrother, trigger: HTMLElement) => void
}) {
  const on = brothers.filter(brother => brother.onList)
  const off = brothers.filter(brother => !brother.onList)
  const groups =
    view === 'on'
      ? [{ key: 'on', title: null, hint: null, rows: on }]
      : [
          { key: 'on', title: m.external_speakers_ours_group_on(), hint: null, rows: on },
          {
            key: 'off',
            title: m.external_speakers_ours_group_off(),
            hint: m.external_speakers_ours_group_off_hint(),
            rows: off,
          },
        ]
  return (
    <div className="border-border bg-card overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={HEAD}>{m.external_speakers_ours_col_brother()}</th>
            <th className={cn(HEAD, 'max-md:hidden')}>{m.external_speakers_col_talks()}</th>
            <th className={cn(HEAD, 'max-md:hidden')}>{m.external_speakers_ours_col_contact()}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(group => (
            <Fragment key={group.key}>
              {group.title && (
                <tr>
                  <td colSpan={3} className="border-border bg-sidebar h-9 border-b px-3.5 py-0 text-sm">
                    <span className="flex items-baseline gap-2">
                      <span className="font-semibold">{group.title}</span>
                      <span className="text-faint tabular-nums">{group.rows.length}</span>
                      {group.hint && group.rows.length > 0 && (
                        <span className="text-faint max-sm:hidden">· {group.hint}</span>
                      )}
                    </span>
                  </td>
                </tr>
              )}
              {group.rows.map(brother => (
                <BrotherRow
                  key={brother.memberId}
                  brother={brother}
                  selected={brother.memberId === selectedId}
                  onOpen={onOpen}
                />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
