import { Plus } from 'lucide-react'
import { type Ref, useState } from 'react'
import { type FetcherWithComponents, Link } from 'react-router'
import type { DirectoryCongregation, DirectorySpeaker } from '~/features/events/model/external-speaker.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { Textarea } from '~/shared/ui/textarea'
import { NewSpeakerCongregationDialog } from './NewSpeakerCongregationDialog'
import { TalkNumbersInput } from './TalkNumbersInput'

// A speaker's sheet as a form, in the side panel: new, or « Modifier ». Saved by the panel's footer through a fetcher;
// a refusal (a duplicate, nobody to reach) comes back above the fields.

export const SPEAKER_FORM_ID = 'external-speaker-form'

/** What the page's action answers to a refused save. */
export interface SpeakerRefusal {
  ok: false
  error: string
  field?: string
  /** A duplicate: the speaker already there, to open instead. */
  existingId?: number
}

const NO_CONGREGATION = 'none'
/** The menu's last choice: not a value, it opens « Nouvelle assemblée ». */
const NEW_CONGREGATION = 'new'

function refusalOf(data: unknown): SpeakerRefusal | null {
  const answer = data as { ok?: boolean } | undefined
  return answer?.ok === false ? (answer as SpeakerRefusal) : null
}

function SecondField({
  id,
  name,
  type,
  label,
  addLabel,
  defaultValue,
}: {
  id: string
  name: string
  type: 'tel' | 'email'
  label: string
  addLabel: string
  defaultValue: string
}) {
  const [shown, setShown] = useState(defaultValue !== '')
  if (!shown) {
    return (
      <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setShown(true)}>
        <Plus aria-hidden="true" />
        {addLabel}
      </Button>
    )
  }
  return (
    <Input
      id={id}
      name={name}
      type={type}
      defaultValue={defaultValue}
      aria-label={label}
      autoFocus={defaultValue === ''}
    />
  )
}

export function SpeakerForm({
  speaker,
  congregations,
  defaultCongregationId,
  fetcher,
  formRef,
}: {
  /** Null while creating. */
  speaker: DirectorySpeaker | null
  congregations: DirectoryCongregation[]
  /** The congregation a new speaker joins, when opened from one. */
  defaultCongregationId: number | null
  fetcher: FetcherWithComponents<unknown>
  formRef: Ref<HTMLFormElement>
}) {
  const refusal = refusalOf(fetcher.data)
  const congregationId = speaker ? speaker.speakerCongregationId : defaultCongregationId
  const field = (name: string) => refusal?.field === name
  // A legacy speaker without congregation keeps « none »; a new one starts on the placeholder.
  const [congregation, setCongregation] = useState(
    congregationId != null ? String(congregationId) : speaker != null ? NO_CONGREGATION : '',
  )
  const [creating, setCreating] = useState(false)

  return (
    <fetcher.Form id={SPEAKER_FORM_ID} method="post" ref={formRef} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="intent" value={speaker ? 'speaker-update' : 'speaker-create'} />
      {speaker && <input type="hidden" name="speakerId" value={speaker.id} />}

      {refusal && (
        <p role="alert" className="bg-danger-soft text-danger-text rounded-md px-3 py-2.5 text-sm">
          {refusal.error}
          {refusal.existingId != null && (
            <>
              {' '}
              <Link to={`?speaker=${refusal.existingId}`} className="font-medium underline underline-offset-2">
                {m.external_speakers_open_sheet()}
              </Link>
            </>
          )}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="speaker-name">{m.external_speakers_field_name()}</Label>
        <Input
          id="speaker-name"
          name="name"
          defaultValue={speaker?.name ?? ''}
          placeholder={m.external_speakers_contact_name()}
          aria-invalid={field('name') || undefined}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="speaker-congregation">{m.external_speakers_field_congregation()}</Label>
        <Select
          name="speakerCongregationId"
          value={congregation}
          onValueChange={next => (next === NEW_CONGREGATION ? setCreating(true) : setCongregation(next))}
        >
          <SelectTrigger
            id="speaker-congregation"
            className="w-full"
            aria-invalid={field('speakerCongregationId') || undefined}
          >
            <SelectValue placeholder={m.external_speakers_field_congregation_placeholder()} />
          </SelectTrigger>
          <SelectContent>
            {congregations.map(each => (
              <SelectItem key={each.id} value={String(each.id)}>
                {each.name}
              </SelectItem>
            ))}
            {/* Kept for the legacy speakers that had none; choosing it leaves the speaker « à compléter ». */}
            {speaker?.speakerCongregationId == null && speaker != null && (
              <SelectItem value={NO_CONGREGATION}>{m.external_speakers_group_none()}</SelectItem>
            )}
            <SelectSeparator />
            <SelectItem value={NEW_CONGREGATION}>{m.external_speakers_field_congregation_new()}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">{m.external_speakers_field_congregation_help()}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="speaker-phone">{m.external_speakers_field_phone()}</Label>
          <Input
            id="speaker-phone"
            name="phone"
            type="tel"
            defaultValue={speaker?.phone ?? ''}
            aria-invalid={field('phone') || undefined}
          />
          <SecondField
            id="speaker-phone2"
            name="phone2"
            type="tel"
            label={m.external_speakers_field_phone2()}
            addLabel={m.external_speakers_add_phone2()}
            defaultValue={speaker?.phone2 ?? ''}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="speaker-email">{m.external_speakers_field_email()}</Label>
          <Input
            id="speaker-email"
            name="email"
            type="email"
            defaultValue={speaker?.email ?? ''}
            aria-invalid={field('email') || undefined}
          />
          <SecondField
            id="speaker-email2"
            name="email2"
            type="email"
            label={m.external_speakers_field_email2()}
            addLabel={m.external_speakers_add_email2()}
            defaultValue={speaker?.email2 ?? ''}
          />
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">{m.external_speakers_contact_help()}</p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="speaker-talks">{m.external_speakers_field_talks()}</Label>
        <TalkNumbersInput
          id="speaker-talks"
          name="talks"
          defaultValue={speaker?.talks ?? []}
          placeholder={m.external_speakers_field_talks_placeholder()}
          invalid={field('talks')}
        />
        <p className="text-muted-foreground text-xs">{m.external_speakers_field_talks_help()}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="speaker-notes">{m.external_speakers_field_notes()}</Label>
        <Textarea id="speaker-notes" name="notes" rows={3} defaultValue={speaker?.notes ?? ''} />
      </div>
      {creating && (
        <NewSpeakerCongregationDialog
          allowImport={false}
          onOpenChange={setCreating}
          onCreated={id => {
            setCreating(false)
            setCongregation(String(id))
          }}
        />
      )}
    </fetcher.Form>
  )
}
