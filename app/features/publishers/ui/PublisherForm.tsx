import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { FormSection, SegmentedControl } from '@unitae/ui'
import { type ReactNode, useEffect, useState } from 'react'
import { Form } from 'react-router'

import { publisherFormSchema } from '~/features/publishers/schemas/publisher.schema'
import * as m from '~/i18n/paraglide/messages'
import { Checkbox } from '~/shared/ui/checkbox'
import { FormSaveBar } from '~/shared/ui/FormSaveBar'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { formatGroupName } from '~/shared/utils/format-group-name'

const NO_GROUP = '__none__'
type Gender = 'male' | 'female'
type Nomination = 'none' | 'servant' | 'elder'

/** The person as the form starts: an existing record, or nothing for a new one. */
export interface PublisherFormValues {
  firstname: string
  lastname: string
  isMale: boolean | null
  birthDate: Date | null
  baptismDate: Date | null
  arrivedAt: Date | null
  phone: string
  email: string
  address: string
  publisherGroupId: number | null
  isAnointed: boolean
  isHelder: boolean
  isServant: boolean
}

interface PublisherFormProps {
  values?: PublisherFormValues
  groups: { id: number; name: string }[]
  /** A new publisher's arrival date: today, on the congregation's calendar. */
  arrivalDefault?: string
  /** Their login's own e-mail, said apart from the contact one. */
  loginEmail?: string | null
  actionData: unknown
  /** After the four sections, e.g. where the pioneer service is managed. */
  after?: ReactNode
  /** Cancel, then the primary save, for the save bar. */
  actions: ReactNode
  onDirtyChange: (dirty: boolean) => void
}

// Date-only values are stored at UTC midnight: their ISO day is the calendar day, whatever the reader's zone.
const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : '')

function nominationOf(values?: PublisherFormValues): Nomination {
  if (values?.isHelder) return 'elder'
  if (values?.isServant) return 'servant'
  return 'none'
}

/** The publisher form of the new and edit pages: who the person is, how to reach them, their group, their baptism. */
export function PublisherForm({
  values,
  groups,
  arrivalDefault,
  loginEmail,
  actionData,
  after,
  actions,
  onDirtyChange,
}: PublisherFormProps) {
  const creating = values == null
  const { ref, changes } = useFormChanges()
  useEffect(() => onDirtyChange(changes > 0), [changes, onDirtyChange])
  useFocusError(actionData as never)
  const [form, fields] = useForm({
    lastResult: actionData as never,
    shouldValidate: 'onBlur',
    shouldRevalidate: 'onInput',
    onValidate: ({ formData }) => parseWithZod(formData, { schema: publisherFormSchema }),
  })
  const [gender, setGender] = useState<Gender | null>(values?.isMale == null ? null : values.isMale ? 'male' : 'female')
  const [nomination, setNomination] = useState<Nomination>(nominationOf(values))
  const [group, setGroup] = useState(values?.publisherGroupId != null ? String(values.publisherGroupId) : NO_GROUP)
  const invalid = (name: keyof typeof fields) => fields[name].errors != null

  return (
    <Form method="post" {...getFormProps(form)} ref={ref} className="flex flex-col pb-24">
      <FormSection title={m.publishers_form_identity()} description={m.publishers_form_identity_hint()}>
        <Field
          id="firstname"
          label={m.publishers_form_firstname()}
          error={invalid('firstname') && m.publishers_form_error_firstname()}
        >
          <Input
            id="firstname"
            name="firstname"
            defaultValue={values?.firstname}
            required
            aria-invalid={invalid('firstname')}
          />
        </Field>
        <Field
          id="lastname"
          label={m.publishers_form_lastname()}
          error={invalid('lastname') && m.publishers_form_error_lastname()}
        >
          <Input
            id="lastname"
            name="lastname"
            defaultValue={values?.lastname}
            required
            aria-invalid={invalid('lastname')}
          />
        </Field>
        <Field
          label={m.publishers_form_brother_or_sister()}
          error={invalid('gender') && m.publishers_form_error_gender()}
        >
          <input type="hidden" name="gender" value={gender ?? ''} />
          <SegmentedControl
            aria-label={m.publishers_form_brother_or_sister()}
            options={[
              { value: 'male', label: m.publishers_form_brother() },
              { value: 'female', label: m.publishers_form_sister() },
            ]}
            value={gender}
            onValueChange={setGender}
          />
        </Field>
        <Field
          id="birthDate"
          label={m.publishers_form_birth_date()}
          error={invalid('birthDate') && m.publishers_form_error_date()}
        >
          <Input id="birthDate" name="birthDate" type="date" defaultValue={day(values?.birthDate ?? null)} />
        </Field>
      </FormSection>

      <FormSection title={m.publishers_record_contact()} description={m.publishers_form_contact_hint()}>
        <Field id="phone" label={m.publishers_form_phone()} error={invalid('phone') && m.publishers_form_error_phone()}>
          <Input id="phone" name="phone" type="tel" defaultValue={values?.phone} aria-invalid={invalid('phone')} />
        </Field>
        <Field
          id="email"
          label={m.publishers_record_email()}
          error={invalid('email') && m.publishers_form_error_email()}
          hint={loginEmail ? m.publishers_form_email_login_hint({ email: loginEmail }) : undefined}
        >
          <Input id="email" name="email" type="email" defaultValue={values?.email} aria-invalid={invalid('email')} />
        </Field>
        <Field id="address" label={m.publishers_record_address()} className="col-span-full">
          <Input id="address" name="address" defaultValue={values?.address} />
        </Field>
      </FormSection>

      <FormSection title={m.publishers_record_congregation()} description={m.publishers_form_congregation_hint()}>
        <Field id="group" label={m.publishers_form_field_service_group()}>
          <input type="hidden" name="group" value={group === NO_GROUP ? '' : group} />
          <Select value={group} onValueChange={setGroup}>
            <SelectTrigger id="group" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_GROUP}>{m.publishers_form_no_group()}</SelectItem>
              {groups.map(option => (
                <SelectItem key={option.id} value={String(option.id)}>
                  {formatGroupName(option.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          id="arrivedAt"
          label={m.publishers_form_arrived_at()}
          hint={m.publishers_form_arrived_at_hint()}
          error={invalid('arrivedAt') && m.publishers_form_error_date()}
        >
          <Input
            id="arrivedAt"
            name="arrivedAt"
            type="date"
            defaultValue={creating ? arrivalDefault : day(values.arrivedAt)}
          />
        </Field>
      </FormSection>

      <FormSection title={m.publishers_form_baptism_section()} description={m.publishers_form_baptism_section_hint()}>
        <Field
          id="baptismDate"
          label={m.publishers_form_baptism_date()}
          hint={m.publishers_form_baptism_hint()}
          error={invalid('baptismDate') && m.publishers_form_error_date()}
        >
          <Input id="baptismDate" name="baptismDate" type="date" defaultValue={day(values?.baptismDate ?? null)} />
        </Field>
        <div className="flex min-h-9 items-center gap-2.5 self-end">
          <Checkbox id="isAnointed" name="isAnointed" defaultChecked={values?.isAnointed} />
          <Label htmlFor="isAnointed" className="font-normal">
            {m.publishers_form_anointed()}
          </Label>
        </div>
        {gender === 'male' && (
          <Field label={m.publishers_record_nomination()} className="col-span-full">
            <input type="hidden" name="nomination" value={nomination} />
            <SegmentedControl
              aria-label={m.publishers_record_nomination()}
              className="max-w-120"
              options={[
                { value: 'none', label: m.publishers_form_nomination_none() },
                { value: 'servant', label: m.publishers_record_servant() },
                { value: 'elder', label: m.publishers_record_elder() },
              ]}
              value={nomination}
              onValueChange={setNomination}
            />
          </Field>
        )}
      </FormSection>

      {after}

      {(creating || changes > 0) && <FormSaveBar changes={creating ? null : changes}>{actions}</FormSaveBar>}
    </Form>
  )
}

interface FieldProps {
  id?: string
  label: string
  hint?: string
  error?: string | false
  className?: string
  children: ReactNode
}

function Field({ id, label, hint, error, className, children }: FieldProps) {
  return (
    <div className={className ? `flex flex-col gap-2 ${className}` : 'flex flex-col gap-2'}>
      {id ? <Label htmlFor={id}>{label}</Label> : <span className="font-medium text-sm">{label}</span>}
      {children}
      {hint && !error && <p className="text-faint text-xs">{hint}</p>}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
