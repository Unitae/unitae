import type { Ref } from 'react'
import type { FetcherWithComponents } from 'react-router'
import type { DirectoryCongregation } from '~/features/events/model/external-speaker.type'
import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Textarea } from '~/shared/ui/textarea'

// A congregation's name, its two contacts and notes: the « Nouvelle assemblée » dialog and the panel's « Modifier »
// share these fields.

function refusalMessage(data: unknown): string | null {
  const answer = data as { ok?: boolean; error?: string } | undefined
  return answer?.ok === false ? (answer.error ?? null) : null
}

function ContactRow({
  prefix,
  label,
  values,
}: {
  prefix: 'responsible' | 'coordinator'
  label: string
  values: string[]
}) {
  const [name, phone, email] = values
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.2fr_1fr_1.3fr]">
        <Input
          name={`${prefix}Name`}
          defaultValue={name}
          placeholder={m.external_speakers_contact_name()}
          aria-label={label}
        />
        <Input
          name={`${prefix}Phone`}
          type="tel"
          defaultValue={phone}
          placeholder={m.external_speakers_field_phone()}
          aria-label={`${label} · ${m.external_speakers_field_phone()}`}
        />
        <Input
          name={`${prefix}Email`}
          type="email"
          defaultValue={email}
          placeholder={m.external_speakers_field_email()}
          aria-label={`${label} · ${m.external_speakers_field_email()}`}
        />
      </div>
    </fieldset>
  )
}

export function SpeakerCongregationFields({
  congregation,
  withNotes,
}: {
  congregation: DirectoryCongregation | null
  withNotes: boolean
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="congregation-name">{m.external_speakers_congregation_field_name()}</Label>
        <Input id="congregation-name" name="name" defaultValue={congregation?.name ?? ''} required />
      </div>
      <ContactRow
        prefix="responsible"
        label={m.external_speakers_responsible()}
        values={[
          congregation?.responsibleName ?? '',
          congregation?.responsiblePhone ?? '',
          congregation?.responsibleEmail ?? '',
        ]}
      />
      <ContactRow
        prefix="coordinator"
        label={m.external_speakers_coordinator()}
        values={[
          congregation?.coordinatorName ?? '',
          congregation?.coordinatorPhone ?? '',
          congregation?.coordinatorEmail ?? '',
        ]}
      />
      <p className="text-muted-foreground text-xs">{m.external_speakers_congregation_contacts_help()}</p>
      {withNotes && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="congregation-notes">{m.external_speakers_congregation_notes()}</Label>
          <Textarea id="congregation-notes" name="notes" rows={3} defaultValue={congregation?.notes ?? ''} />
        </div>
      )}
    </>
  )
}

export const CONGREGATION_FORM_ID = 'speaker-congregation-form'

/** The panel's « Modifier »: saved by the panel's footer. */
export function SpeakerCongregationForm({
  congregation,
  fetcher,
  formRef,
}: {
  congregation: DirectoryCongregation
  fetcher: FetcherWithComponents<unknown>
  formRef: Ref<HTMLFormElement>
}) {
  const error = refusalMessage(fetcher.data)
  return (
    <fetcher.Form id={CONGREGATION_FORM_ID} method="post" ref={formRef} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="intent" value="congregation-update" />
      <input type="hidden" name="speakerCongregationId" value={congregation.id} />
      {error && (
        <p role="alert" className="bg-danger-soft text-danger-text rounded-md px-3 py-2.5 text-sm">
          {error}
        </p>
      )}
      <SpeakerCongregationFields congregation={congregation} withNotes />
    </fetcher.Form>
  )
}

export { refusalMessage }
