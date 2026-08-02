import { getFormProps, getInputProps, type SubmissionResult, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Trash2 } from 'lucide-react'
import { Form } from 'react-router'
import { updateEmergencyInfoSchema } from '~/features/publishers/schemas/emergency-info.schema'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import type { EmergencyInfoViewData } from './EmergencyInfoView'

export default function PublisherEmergencyForm({
  info,
  lastResult,
}: {
  info: EmergencyInfoViewData
  lastResult?: SubmissionResult
}) {
  const [form, fields] = useForm({
    lastResult,
    // Only the contact list needs Conform's managed defaults; the two flags are
    // plain checkboxes (defaultChecked below) that the schema coerces on submit.
    defaultValue: {
      contacts: info.emergencyContacts.map(contact => ({
        name: contact.name,
        relationship: contact.relationship,
        phone: contact.phone,
      })),
    },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: updateEmergencyInfoSchema })
    },
  })

  const contacts = fields.contacts.getFieldList()

  return (
    <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-3 text-sm">
          <input
            className="size-4 rounded border border-input"
            type="checkbox"
            name={fields.dpaCardUpToDate.name}
            defaultChecked={info.dpaCardUpToDate}
          />
          {m.publishers_emergency_dpa_label()}
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input
            className="size-4 rounded border border-input"
            type="checkbox"
            name={fields.survivalBackpackReady.name}
            defaultChecked={info.survivalBackpackReady}
          />
          {m.publishers_emergency_backpack_label()}
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <p className="font-medium text-sm">{m.publishers_emergency_contacts_title()}</p>

        {contacts.map((contact, index) => {
          const contactFields = contact.getFieldset()
          return (
            <div key={contact.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <div className="space-y-1">
                <Label htmlFor={contactFields.name.id}>{m.publishers_emergency_contact_name()}</Label>
                <Input {...getInputProps(contactFields.name, { type: 'text' })} />
                {contactFields.name.errors && <p className="text-destructive text-xs">{contactFields.name.errors}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor={contactFields.relationship.id}>{m.publishers_emergency_contact_relationship()}</Label>
                <Input {...getInputProps(contactFields.relationship, { type: 'text' })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={contactFields.phone.id}>{m.publishers_emergency_contact_phone()}</Label>
                <Input {...getInputProps(contactFields.phone, { type: 'text' })} />
                {contactFields.phone.errors && <p className="text-destructive text-xs">{contactFields.phone.errors}</p>}
              </div>
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="icon"
                  title={m.publishers_emergency_contact_remove()}
                  {...form.remove.getButtonProps({ name: fields.contacts.name, index })}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          )
        })}

        <Button
          variant="outline"
          className="self-start"
          {...form.insert.getButtonProps({ name: fields.contacts.name })}
        >
          {m.publishers_emergency_contact_add()}
        </Button>
      </div>

      <SubmitButton className="self-start">{m.common_save()}</SubmitButton>
    </Form>
  )
}
