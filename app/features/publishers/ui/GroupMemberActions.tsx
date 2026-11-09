import { Eye, HeartHandshake, Mail, Pencil, Siren } from 'lucide-react'
import { Link } from 'react-router'
import type { EmergencyGap } from '~/features/publishers/model/member-signals'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

import type { GroupMemberRow } from './GroupMembersTable'

const EMERGENCY_GAP_LABEL: Record<EmergencyGap, () => string> = {
  card: m.groups_signal_emergency_card,
  backpack: m.groups_signal_emergency_backpack,
  contact: m.groups_signal_emergency_contact,
}

const iconClass =
  'opacity-0 transition-opacity duration-(--u-duration-fast) focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100'

// Missing emergency information is common enough that a label on every row would drown the
// others: an icon after the name instead, titled with what is missing and opening the member's
// emergency panel. The padding makes it a touch target; the negative margin keeps the row's height.
export function EmergencyLink({
  name,
  gaps,
  onOpen,
}: {
  name: string
  gaps: EmergencyGap[]
  onOpen: (trigger: HTMLElement) => void
}) {
  const items = gaps.map(gap => EMERGENCY_GAP_LABEL[gap]()).join(' · ')
  const label = m.groups_member_emergency_aria({ name, items })
  return (
    <button
      type="button"
      onClick={event => onOpen(event.currentTarget)}
      className="-my-1 ml-0.5 inline-flex rounded-md p-1 align-middle text-warning-text outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={label}
      title={label}
    >
      <Siren className="size-4" />
    </button>
  )
}

/** Write, record a visit, open or edit the record: on hover, in a wide table. */
export function MemberActions({
  member,
  name,
  canRecordVisits,
  canViewPublishers,
  canEditPublishers,
  onOpenVisit,
}: {
  member: GroupMemberRow
  name: string
  canRecordVisits: boolean
  canViewPublishers: boolean
  canEditPublishers: boolean
  onOpenVisit: () => void
}) {
  return (
    <div className="flex justify-end gap-0.5">
      {member.email && (
        <Button asChild variant="ghost" size="icon-sm" className={iconClass}>
          <a href={`mailto:${member.email}`} aria-label={m.groups_member_email_aria({ name })}>
            <Mail />
          </a>
        </Button>
      )}
      {canRecordVisits && (
        <Button
          variant="ghost"
          size="icon-sm"
          className={iconClass}
          onClick={onOpenVisit}
          aria-label={m.groups_member_visit_aria({ name })}
          title={m.groups_member_visit_aria({ name })}
        >
          <HeartHandshake />
        </Button>
      )}
      {canViewPublishers && (
        <Button asChild variant="ghost" size="icon-sm" className={iconClass}>
          <Link to={`/publishers/${member.id}/view`} aria-label={m.groups_member_view_aria({ name })}>
            <Eye />
          </Link>
        </Button>
      )}
      {canEditPublishers && (
        <Button asChild variant="ghost" size="icon-sm" className={iconClass}>
          <Link to={`/publishers/${member.id}/edit`} aria-label={m.groups_member_edit_aria({ name })}>
            <Pencil />
          </Link>
        </Button>
      )}
    </div>
  )
}
