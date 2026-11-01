import { getFormProps, getInputProps, type SubmissionResult, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { Form } from 'react-router'
import {
  type GroupLeaderCandidate,
  groupLeaderAvailability,
} from '~/features/publishers/model/group-leader-availability'
import { createGroupSchema } from '~/features/publishers/schemas/group.schema'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { FormActions } from '~/shared/ui/FormActions'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PersonDropdown, type PersonOption } from '~/shared/ui/PersonDropdown'
import { SubmitButton } from '~/shared/ui/SubmitButton'

export interface GroupFormValues {
  id: number
  name: string
  address: string
  responsibleId: number
  deputyId: number | null
}

/**
 * The form that creates a field service group or edits one (`group`). It posts to the page's own
 * action; `onChange` feeds the page's unsaved-changes guard.
 */
export function GroupForm({
  candidates,
  group,
  lastResult,
  submitLabel,
  onChange,
}: {
  candidates: (PersonOption & GroupLeaderCandidate)[]
  group?: GroupFormValues
  lastResult: SubmissionResult<string[]> | undefined
  submitLabel: string
  onChange: () => void
}) {
  useFocusError(lastResult)
  const [form, fields] = useForm({
    lastResult,
    defaultValue: group && {
      name: group.name,
      address: group.address,
      responsible: String(group.responsibleId),
      deputy: group.deputyId != null ? String(group.deputyId) : '',
    },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: createGroupSchema })
    },
  })
  const { disabledIds, disabledReason } = groupLeaderAvailability(candidates, group?.id)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.groups_info_title()}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4" onChange={onChange}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={fields.name.id}>{m.groups_form_name()}</Label>
              <Input {...getInputProps(fields.name, { type: 'text' })} placeholder={m.groups_form_name_placeholder()} />
              {fields.name.errors && <p className="text-destructive text-sm">{fields.name.errors}</p>}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={fields.address.id}>{m.groups_form_address()}</Label>
              <Input
                {...getInputProps(fields.address, { type: 'text' })}
                placeholder={m.groups_form_address_placeholder()}
              />
              {fields.address.errors && <p className="text-destructive text-sm">{fields.address.errors}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.responsible.id}>{m.groups_form_responsible()}</Label>
              <PersonDropdown
                id={fields.responsible.id}
                name={fields.responsible.name}
                people={candidates}
                defaultValue={fields.responsible.initialValue as string | undefined}
                placeholder={m.groups_form_responsible_placeholder()}
                allowNone={false}
                disabledIds={disabledIds}
                disabledReason={disabledReason}
                aria-invalid={fields.responsible.errors !== undefined}
              />
              {fields.responsible.errors && <p className="text-destructive text-sm">{fields.responsible.errors}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.deputy.id}>{m.groups_form_deputy()}</Label>
              <PersonDropdown
                id={fields.deputy.id}
                name={fields.deputy.name}
                people={candidates}
                defaultValue={fields.deputy.initialValue as string | undefined}
                placeholder={m.groups_form_no_deputy()}
                noneLabel={m.groups_form_no_deputy()}
                disabledIds={disabledIds}
                disabledReason={disabledReason}
                aria-invalid={fields.deputy.errors !== undefined}
              />
              {fields.deputy.errors && <p className="text-destructive text-sm">{fields.deputy.errors}</p>}
            </div>
          </div>

          <FormActions>
            <SubmitButton>{submitLabel}</SubmitButton>
          </FormActions>
        </Form>
      </CardContent>
    </Card>
  )
}
