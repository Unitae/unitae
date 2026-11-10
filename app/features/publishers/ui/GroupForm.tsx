import { getFormProps, getInputProps, type SubmissionResult, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { FormSection } from '@unitae/ui'
import { type ReactNode, useEffect, useState } from 'react'
import { Form } from 'react-router'
import { groupLeaderAvailability } from '~/features/publishers/model/group-leader-availability'
import type { GroupCandidate, GroupMember } from '~/features/publishers/model/group-members-draft'
import { createGroupSchema } from '~/features/publishers/schemas/group.schema'
import { GroupMembersSection } from '~/features/publishers/ui/GroupMembersSection'
import { useGroupMembersDraft } from '~/features/publishers/ui/use-group-members-draft'
import * as m from '~/i18n/paraglide/messages'
import { FormSaveBar } from '~/shared/ui/FormSaveBar'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PersonDropdown } from '~/shared/ui/PersonDropdown'
import { fieldChanged, valuesOf } from '~/shared/utils/form-changes'
import { formatGroupName } from '~/shared/utils/format-group-name'

export interface GroupFormValues {
  id: number
  name: string
  address: string
  responsibleId: number
  deputyId: number | null
}

const STAGED = ['addMember', 'removeMember']

/** The changed fields, then each publisher added or removed: « 3 modifications non enregistrées ». */
function countGroupChanges(before: FormData, after: FormData): number {
  const names = new Set([...before.keys(), ...after.keys()].filter(name => !STAGED.includes(name)))
  const fields = [...names].filter(name => fieldChanged(before, after, name)).length
  return fields + STAGED.reduce((sum, name) => sum + valuesOf(after, name).length, 0)
}

const idOf = (value: string) => (value === '' ? null : Number(value))

interface GroupFormProps {
  /** The group being edited; absent on the new group page. */
  group?: GroupFormValues
  /** The brothers the leader fields offer. */
  leaders: GroupCandidate[]
  /** Who is in the group now (none for a new one). */
  members: GroupMember[]
  /** Who may be added. */
  candidates: GroupCandidate[]
  lastResult: SubmissionResult<string[]> | undefined
  /** Cancel, then the primary save, for the save bar. */
  actions: ReactNode
  onDirtyChange: (dirty: boolean) => void
}

/**
 * The form that creates a field service group or edits one: its name and address, its overseer and assistant, and
 * its publishers, saved together by the save bar. Leaders chosen from another group join this one with the save.
 */
export function GroupForm({ group, leaders, members, candidates, lastResult, actions, onDirtyChange }: GroupFormProps) {
  const creating = group == null
  const { ref, changes } = useFormChanges(countGroupChanges)
  useEffect(() => onDirtyChange(changes > 0), [changes, onDirtyChange])
  useFocusError(lastResult)
  const [form, fields] = useForm({
    lastResult,
    defaultValue: group && { name: group.name, address: group.address },
    onValidate: ({ formData }) => parseWithZod(formData, { schema: createGroupSchema }),
  })
  const saved = { responsibleId: group?.responsibleId ?? null, deputyId: group?.deputyId ?? null }
  const [responsible, setResponsible] = useState(group ? String(group.responsibleId) : '')
  const [deputy, setDeputy] = useState(group?.deputyId != null ? String(group.deputyId) : '')
  const draft = useGroupMembersDraft({
    members,
    candidates,
    leaders,
    responsibleId: idOf(responsible),
    deputyId: idOf(deputy),
    saved,
  })
  const { disabledIds, disabledReason } = groupLeaderAvailability(leaders, group?.id)
  const memberIds = new Set(members.map(member => member.id))
  // Under a leader field changed in the form: the group the one chosen leaves for this one, if any.
  const movesFrom = (value: string, before: number | null) => {
    const id = idOf(value)
    const leader = id === before ? undefined : leaders.find(each => each.id === id)
    return leader?.group && !memberIds.has(leader.id)
      ? m.groups_form_leader_moves({ name: formatGroupName(leader.group.name) })
      : undefined
  }

  return (
    <Form method="post" {...getFormProps(form)} ref={ref} className="flex flex-col pb-24">
      {form.errors && (
        <p role="alert" className="mb-2 rounded-md bg-destructive/10 px-3.5 py-2.5 text-destructive text-sm">
          {form.errors.join(' ')}
        </p>
      )}

      <FormSection title={m.groups_form_section_group()} description={m.groups_form_section_group_hint()}>
        <Field id={fields.name.id} label={m.groups_form_name()} error={fields.name.errors?.[0]}>
          <Input {...getInputProps(fields.name, { type: 'text' })} placeholder={m.groups_form_name_placeholder()} />
        </Field>
        <Field id={fields.address.id} label={m.groups_form_address()} error={fields.address.errors?.[0]}>
          <Input
            {...getInputProps(fields.address, { type: 'text' })}
            placeholder={m.groups_form_address_placeholder()}
          />
        </Field>
      </FormSection>

      <FormSection title={m.groups_form_section_leaders()} description={m.groups_form_section_leaders_hint()}>
        <Field
          id={fields.responsible.id}
          label={m.groups_form_responsible()}
          hint={movesFrom(responsible, saved.responsibleId)}
          error={fields.responsible.errors?.[0]}
        >
          <PersonDropdown
            id={fields.responsible.id}
            name={fields.responsible.name}
            people={leaders}
            value={responsible}
            onValueChange={setResponsible}
            placeholder={m.groups_form_responsible_placeholder()}
            allowNone={false}
            disabledIds={disabledIds}
            disabledReason={disabledReason}
            aria-invalid={fields.responsible.errors !== undefined}
          />
        </Field>
        <Field
          id={fields.deputy.id}
          label={m.groups_form_deputy()}
          hint={movesFrom(deputy, saved.deputyId)}
          error={fields.deputy.errors?.[0]}
        >
          <PersonDropdown
            id={fields.deputy.id}
            name={fields.deputy.name}
            people={leaders}
            value={deputy}
            onValueChange={setDeputy}
            placeholder={m.groups_form_no_deputy()}
            noneLabel={m.groups_form_no_deputy()}
            disabledIds={disabledIds}
            disabledReason={disabledReason}
            aria-invalid={fields.deputy.errors !== undefined}
          />
        </Field>
      </FormSection>

      <GroupMembersSection draft={draft} groupId={group?.id} />

      {(creating || changes > 0) && <FormSaveBar changes={creating ? null : changes}>{actions}</FormSaveBar>}
    </Form>
  )
}

interface FieldProps {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
}

function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-faint text-xs">{hint}</p>}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
