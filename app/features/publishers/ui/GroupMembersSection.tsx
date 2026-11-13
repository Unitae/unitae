import { Avatar, FormSection, Tag } from '@unitae/ui'
import { groupLeaderAvailability } from '~/features/publishers/model/group-leader-availability'
import type { MemberRow } from '~/features/publishers/model/group-members-draft'
import type { useGroupMembersDraft } from '~/features/publishers/ui/use-group-members-draft'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Label } from '~/shared/ui/label'
import { PersonDropdown } from '~/shared/ui/PersonDropdown'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { cn } from '~/shared/utils/utils'

type Draft = ReturnType<typeof useGroupMembersDraft>

/**
 * The « Proclamateurs » section of the group form: a picker that adds a publisher (they leave the group they were in),
 * then the group as it will be once saved — those added, those removed (struck, with « Annuler »). The overseer and
 * assistant have no « Retirer »: they stay in the group they lead. The changes post with the form.
 */
export function GroupMembersSection({ draft, groupId }: { draft: Draft; groupId?: number }) {
  const { disabledIds, disabledReason } = groupLeaderAvailability(draft.available, groupId)
  const groupOf = new Map(draft.available.map(candidate => [candidate.id, candidate.group]))
  const changed = draft.added.length + draft.removed.length > 0 || draft.rows.some(row => row.state === 'added')

  return (
    <FormSection title={m.groups_table_publishers()} description={m.groups_members_description()}>
      {draft.added.map(id => (
        <input key={`add-${id}`} type="hidden" name="addMember" value={id} />
      ))}
      {draft.removed.map(id => (
        <input key={`remove-${id}`} type="hidden" name="removeMember" value={id} />
      ))}

      <div className="col-span-full flex flex-col gap-2">
        <Label htmlFor="group-member-add">{m.groups_members_add_label()}</Label>
        <PersonDropdown
          id="group-member-add"
          name=""
          people={draft.available}
          value=""
          onValueChange={value => value && draft.add(Number(value))}
          placeholder={m.groups_members_add_placeholder()}
          allowNone={false}
          disabledIds={disabledIds}
          disabledReason={disabledReason}
          // Those in no group first; each says the group they would leave.
          describePerson={id => {
            const group = groupOf.get(id)
            return { facts: group ? formatGroupName(group.name) : m.publishers_move_no_group(), rank: group ? 1 : 0 }
          }}
        />
      </div>

      <div className="col-span-full flex flex-col gap-2">
        {draft.rows.length === 0 ? (
          <p className="text-faint text-sm">{m.groups_view_members_empty()}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {draft.rows.map(row => (
              <MemberLine key={row.person.id} row={row} draft={draft} />
            ))}
          </ul>
        )}
        {draft.rows.length > 0 && <p className="text-faint text-sm tabular-nums">{totalLine(draft.total, changed)}</p>}
      </div>
    </FormSection>
  )
}

/** « 21 proclamateurs », or « … une fois enregistré » while changes wait for the save. */
function totalLine(total: number, changed: boolean) {
  const count = String(total)
  if (changed) return m.groups_members_total_after({ count })
  return m.groups_list_publishers({ count })
}

function MemberLine({ row, draft }: { row: MemberRow; draft: Draft }) {
  const name = formatPersonName(row.person)
  const removed = row.state === 'removed'
  return (
    <li className="flex min-h-10 items-center gap-2.5 py-1 pr-1.5 pl-3 text-sm">
      <Avatar name={name} className="size-5 text-[9px]" />
      <span className={cn('min-w-0 truncate', removed && 'text-faint line-through')}>{name}</span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {row.role && <Tag>{row.role === 'responsible' ? m.groups_form_responsible() : m.groups_form_deputy()}</Tag>}
        {row.inactive && <Tag>{m.groups_member_inactive()}</Tag>}
        {row.state === 'added' && (
          <Tag tone="brand">
            {row.from ? m.groups_member_added_from({ name: formatGroupName(row.from.name) }) : m.groups_member_added()}
          </Tag>
        )}
        {removed && <Tag>{m.groups_member_removed()}</Tag>}
      </span>
      {removed ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => draft.restore(row.person.id)}
          aria-label={m.groups_members_restore_aria({ name })}
        >
          {m.common_cancel()}
        </Button>
      ) : (
        row.role == null && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => draft.remove(row.person.id)}
            aria-label={m.groups_members_remove_aria({ name })}
          >
            {m.groups_members_remove()}
          </Button>
        )
      )}
    </li>
  )
}
