import { Avatar, Status, Tag } from '@unitae/ui'
import { Mail, MessageSquare, Phone } from 'lucide-react'

import type { PublisherRecord } from '~/features/publishers/server/publisher-record.queries'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { formatEventDate } from '~/shared/utils/event-time'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'

/** The person: their initials, their name, and what they are in the congregation, as quiet tags. */
export function RecordHeader({ record, pioneerLabel }: { record: PublisherRecord; pioneerLabel: string | null }) {
  const name = formatPersonName(record)
  const tags = [
    record.isPublisher
      ? null
      : record.isMale === false
        ? m.publishers_record_not_publisher_f()
        : m.publishers_record_not_publisher(),
    record.leftAt
      ? record.isMale === false
        ? m.publishers_record_left_tag_f()
        : m.publishers_record_left_tag()
      : null,
    pioneerLabel,
    record.isHelder ? m.publishers_record_elder() : record.isServant ? m.publishers_record_servant() : null,
    record.isAnointed ? m.publishers_record_anointed() : null,
    record.group ? formatGroupName(record.group.name) : null,
  ].filter((tag): tag is string => tag != null)

  return (
    <div className="flex animate-fade-in-up items-center gap-3.5">
      <Avatar name={name} size="md" className="size-11 text-[15px]" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="font-semibold text-3xl tracking-tight max-sm:text-2xl">{name}</h1>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map(tag => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface StatusNoteProps {
  record: PublisherRecord
  timeZone: string
  /** When the record of someone who left is anonymised, unless they come back. */
  anonymisedOn: Date | null
}

/** What the person's status means, and what will change it: inactive, gone, or not yet a publisher. */
export function RecordStatusNote({ record, timeZone, anonymisedOn }: StatusNoteProps) {
  const locale = getLocale()
  const day = (date: Date) =>
    formatEventDate(date, timeZone, locale, { day: 'numeric', month: 'long', year: 'numeric' })
  const month = (date: Date) => formatEventDate(date, timeZone, locale, { month: 'long', year: 'numeric' })

  if (record.leftAt) {
    return (
      <Note status={<Status tone="neutral">{m.publishers_record_left_since({ date: day(record.leftAt) })}</Status>}>
        {anonymisedOn && m.publishers_record_left_anonymised({ date: day(anonymisedOn) })}
      </Note>
    )
  }
  if (record.inactiveAt) {
    return (
      <Note
        status={
          <Status tone="warning">{m.publishers_record_inactive_since({ date: month(record.inactiveAt) })}</Status>
        }
      >
        {m.publishers_record_inactive_note()}
      </Note>
    )
  }
  if (!record.isPublisher) {
    return <Note>{m.publishers_record_not_publisher_note()}</Note>
  }
  return null
}

function Note({ status, children }: { status?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-sidebar px-3.5 py-3 text-sm">
      {status && <span className="text-foreground [&>span]:text-foreground">{status}</span>}
      {children && <p className="text-muted-foreground">{children}</p>}
    </div>
  )
}

const QUICK =
  'flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface font-medium text-xs'

/** On a phone, reaching the person comes first: call, text or write, for the details they have. */
export function RecordQuickContacts({ record }: { record: PublisherRecord }) {
  const links = [
    ...(record.phone
      ? [
          { href: `tel:${record.phone}`, icon: Phone, label: m.publishers_record_call() },
          { href: `sms:${record.phone}`, icon: MessageSquare, label: m.publishers_record_text() },
        ]
      : []),
    ...(record.email ? [{ href: `mailto:${record.email}`, icon: Mail, label: m.publishers_record_email() }] : []),
  ]
  if (links.length === 0) return null
  return (
    <nav
      aria-label={m.publishers_record_reach({ name: formatPersonName(record) })}
      className="grid grid-cols-3 gap-2 md:hidden"
    >
      {links.map(({ href, icon: Icon, label }) => (
        <a key={href} href={href} className={QUICK}>
          <Icon className="size-4.5" aria-hidden="true" />
          {label}
        </a>
      ))}
    </nav>
  )
}
