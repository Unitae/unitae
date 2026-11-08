import { Avatar, Status, Tag } from '@unitae/ui'
import { Link } from 'react-router'
import * as m from '~/i18n/paraglide/messages'

export type PersonName = { firstname: string | null; lastname: string | null }

export const personName = (person: PersonName) => `${person.firstname ?? ''} ${person.lastname ?? ''}`.trim()

interface PersonCellProps {
  /** The publisher in the slot, with their id for the link to their page. */
  person: PersonName | null
  personId: number | null
  /** An external speaker in the slot, instead of a publisher. */
  external?: { name: string } | null
  /** The person is away on the event's date. */
  conflict?: boolean
  /** The viewer may open the publisher's page. */
  linkToPublisher: boolean
  /** Opens the assignment when the viewer may assign: an empty slot becomes a button. */
  onAssign?: (trigger: HTMLElement) => void
}

/** Who fills a slot: a publisher, an external speaker, or « À pourvoir » — worded as on the dashboard. */
export function PersonCell({
  person,
  personId,
  external,
  conflict = false,
  linkToPublisher,
  onAssign,
}: PersonCellProps) {
  if (external) {
    return (
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <Avatar name={external.name} size="sm" />
        <span className="truncate">{external.name}</span>
        <Tag>{m.programs_view_external()}</Tag>
      </span>
    )
  }

  if (person == null) {
    const open = <Status tone="neutral">{m.programs_view_open()}</Status>
    if (onAssign == null) return open
    return (
      <button
        type="button"
        onClick={event => onAssign(event.currentTarget)}
        className="-mx-1.5 rounded-md px-1.5 py-0.5 outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open}
      </button>
    )
  }

  const name = personName(person)
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm">
      <Avatar name={name} size="sm" />
      {linkToPublisher && personId != null ? (
        <Link to={`/publishers/${personId}/view`} className="truncate hover:underline">
          {name}
        </Link>
      ) : (
        <span className="truncate">{name}</span>
      )}
      {conflict && <Status tone="danger">{m.programs_view_absent()}</Status>}
    </span>
  )
}
