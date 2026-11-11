import { Avatar, SegmentedControl } from '@unitae/ui'
import { X } from 'lucide-react'
import { useState } from 'react'
import { useFetcher } from 'react-router'
import type { PanelRole, PanelSeat, RoleKind, SeatKind } from '~/features/congregation/model/organigram-page.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { PersonDropdown, type PersonOption } from '~/shared/ui/PersonDropdown'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

// Who sits in a role, and naming someone. A list (elders, assistants) and the committee are derived: they are shown,
// never edited here. Seats are responsables and adjoints; a team's plain members are edited in Équipes.

type Seated = Exclude<SeatKind, 'member'>

const SEATS_TITLE: Record<RoleKind, () => string> = {
  roster: m.org_seats_list,
  committee: m.org_seats_committee,
  post: m.org_seats_personal,
  team: m.org_seats_team,
  personal: m.org_seats_personal,
}

function seatWord(seat: string, single: boolean, isElder = true): string {
  if (seat === 'deputy') return m.org_seat_deputy()
  if (seat === 'member') return m.org_seat_member()
  if (single) return m.org_seat_leader_personal()
  // As on the chart: a team's elder is its responsable, anyone else its préposé.
  return isElder ? m.org_seat_leader_team() : m.org_seat_servant()
}

const isSingle = (role: PanelRole) => role.kind === 'personal' || role.kind === 'post'
const isListed = (role: PanelRole) => role.kind === 'roster' || role.kind === 'committee'

function SeatRow({ role, person, editable }: { role: PanelRole; person: PanelSeat; editable: boolean }) {
  const fetcher = useFetcher()
  const single = isSingle(role)
  const listed = isListed(role)
  const ids = { roleId: String(role.id), memberId: String(person.memberId) }
  return (
    <li className="flex min-h-9 items-center gap-2.5">
      <Avatar name={person.name} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col text-sm">
        <span className="truncate">{person.name}</span>
        {role.kind === 'post' && person.seat === 'leader' && person.isElder && (
          <span className="text-faint text-xs">{m.org_elder()}</span>
        )}
      </span>
      {editable && !listed && (
        <>
          <Select
            value={person.seat}
            onValueChange={kind => fetcher.submit({ intent: 'seat', ...ids, kind }, { method: 'post' })}
          >
            <SelectTrigger
              size="sm"
              className="w-auto border-transparent text-xs shadow-none"
              aria-label={m.org_seat_of({ name: person.name })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="leader">{seatWord('leader', single, person.isElder)}</SelectItem>
              <SelectItem value="deputy">{seatWord('deputy', single)}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.org_remove_person({ name: person.name })}
            onClick={() => fetcher.submit({ intent: 'unseat', ...ids }, { method: 'post' })}
          >
            <X aria-hidden="true" />
          </Button>
        </>
      )}
      {!editable && !listed && (
        <span className="text-faint text-xs">{seatWord(person.seat, single, person.isElder)}</span>
      )}
    </li>
  )
}

/** Naming someone: a person, responsable or adjoint. On a personal role, naming a titulaire replaces the one there. */
function SeatAdd({ role, people, nonElderIds }: { role: PanelRole; people: PersonOption[]; nonElderIds: number[] }) {
  const fetcher = useFetcher()
  const single = isSingle(role)
  const hasTitulaire = role.seats.some(seat => seat.seat === 'leader')
  const [kind, setKind] = useState<Seated>(single && hasTitulaire ? 'deputy' : 'leader')
  const [chosen, setChosen] = useState('')
  // The committee's posts go to an elder; their adjoints need not be.
  const elderOnly = role.kind === 'post' && kind === 'leader'
  const replacing = single && hasTitulaire && kind === 'leader'

  return (
    <fetcher.Form method="post" className="flex flex-col gap-2 pt-1.5" onSubmit={() => setChosen('')}>
      <input type="hidden" name="intent" value="seat" />
      <input type="hidden" name="roleId" value={role.id} />
      <input type="hidden" name="kind" value={kind} />
      <PersonDropdown
        name="memberId"
        people={people}
        value={chosen}
        onValueChange={setChosen}
        allowNone={false}
        placeholder={elderOnly ? m.org_add_placeholder_elder() : m.org_add_placeholder()}
        disabledIds={elderOnly ? nonElderIds : []}
        disabledReason={() => m.org_not_elder()}
      />
      <div className="flex items-center gap-2">
        <SegmentedControl<Seated>
          size="sm"
          aria-label={m.org_form_type()}
          value={kind}
          onValueChange={setKind}
          options={[
            { value: 'leader', label: seatWord('leader', single) },
            { value: 'deputy', label: m.org_seat_deputy() },
          ]}
        />
        <span className="flex-1" />
        <Button type="submit" size="sm" disabled={!chosen || fetcher.state !== 'idle'}>
          {replacing ? m.org_replace_button() : m.org_add_button()}
        </Button>
      </div>
      {replacing && <p className="text-faint text-xs">{m.org_replace_hint()}</p>}
    </fetcher.Form>
  )
}

export function RoleSeats({
  role,
  people,
  nonElderIds,
  editable,
}: {
  role: PanelRole
  /** Everyone who can be named, login or not; absent for a reader. */
  people?: PersonOption[]
  nonElderIds?: number[]
  /** The viewer may name and remove people here. */
  editable: boolean
}) {
  const title = SEATS_TITLE[role.kind]()
  return (
    <section className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0" aria-label={title}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {role.seats.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {role.kind === 'team' ? m.org_seats_empty_team() : m.org_seats_empty()}
        </p>
      ) : (
        <ul className="flex flex-col">
          {role.seats.map(person => (
            <SeatRow key={person.memberId} role={role} person={person} editable={editable} />
          ))}
        </ul>
      )}
      {role.kind === 'roster' && <p className="text-muted-foreground text-sm">{m.org_roster_hint()}</p>}
      {role.kind === 'committee' && <p className="text-muted-foreground text-sm">{m.org_committee_hint()}</p>}
      {editable && !isListed(role) && people != null && (
        <SeatAdd role={role} people={people} nonElderIds={nonElderIds ?? []} />
      )}
    </section>
  )
}
