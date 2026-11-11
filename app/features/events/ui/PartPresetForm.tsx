import { type ReactNode, type Ref, useRef, useState } from 'react'
import { type FetcherWithComponents, Form } from 'react-router'
import { renderShareMessage, SHARE_VARIABLES, type ShareMessageContext } from '~/features/events/model/share-message'
import type { PartPresetFormValues } from '~/features/events/schemas/part-preset.schema'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { SettingRow } from '~/shared/ui/SettingRow'
import { Switch } from '~/shared/ui/switch'
import { Textarea } from '~/shared/ui/textarea'

type PartPresetFormProps = {
  // Derived from the schema rather than restated, so the form cannot drift
  // from what the action will accept.
  preset: PartPresetFormValues | null
  isSystem: boolean
  /** Catalogue wording, shown when a field is blank. Leaving a field empty is
      how a congregation keeps the built-in text and follows its language. */
  placeholders?: { name: string; speakerLabel: string; readerLabel: string; shareMessage: string }
  // Absent means no error. A separate null state would say nothing extra.
  errors?: string[]
  /** The congregation's address, so that the preview's link is one the author recognises. */
  baseUrl?: string
  /** Posts through this fetcher, from a panel whose footer holds the save button (`id` ties them). */
  fetcher?: Pick<FetcherWithComponents<unknown>, 'Form'>
  id?: string
  formRef?: Ref<HTMLFormElement>
  /** Fields posted with the form: the intent, the type's id. */
  hidden?: ReactNode
  /** Nothing can be changed: the fields only show the type. */
  readOnly?: boolean
}

// Plausible values for the preview. Every slot is filled, so the author sees
// the message at its longest — the line-drop rule only ever shortens it, and a
// preview that quietly hid lines would understate what actually gets sent.
const PREVIEW_CONTEXT: ShareMessageContext = {
  assignee: 'Jean Dupont',
  assigneeFirstname: 'Jean',
  assistant: 'Marc Petit',
  partName: '1re partie',
  section: 'Appliquons-nous au ministère',
  topic: 'Comment entamer une conversation',
  duration: '4 min',
  date: 'mardi 3 septembre',
  time: '19:30',
  eventName: 'Réunion de semaine',
  note: 'Prévoir la vidéo',
  congregation: 'Assemblée de Lyon',
  link: 'https://unitae.example.com/board',
}

export function PartPresetForm({
  preset,
  isSystem,
  placeholders,
  errors,
  baseUrl,
  fetcher,
  id,
  formRef,
  hidden,
  readOnly = false,
}: PartPresetFormProps) {
  const [message, setMessage] = useState(preset?.shareMessage ?? '')
  const [hasReaderSlot, setHasReaderSlot] = useState(preset?.hasReaderSlot ?? false)
  const messageField = useRef<HTMLTextAreaElement>(null)
  const FormElement = fetcher?.Form ?? Form

  // Puts a variable where the cursor is in the message, as if typed: the form counts it, and the preview follows.
  function insertVariable(variable: string) {
    const field = messageField.current
    const token = `{{${variable}}}`
    if (!field) return setMessage(current => current + token)
    const start = field.selectionStart ?? message.length
    const end = field.selectionEnd ?? message.length
    const next = message.slice(0, start) + token + message.slice(end)
    setMessage(next)
    requestAnimationFrame(() => {
      field.focus()
      field.setSelectionRange(start + token.length, start + token.length)
    })
  }

  // Rendered with renderShareMessage — the same function the share button will
  // use once it exists, which is the point of keeping that module pure: the
  // preview and the sent message cannot diverge.
  const preview = renderShareMessage(
    message,
    baseUrl ? { ...PREVIEW_CONTEXT, link: `${baseUrl}/board` } : PREVIEW_CONTEXT,
  )

  return (
    <FormElement method="post" id={id} ref={formRef} className="flex flex-col gap-5">
      {hidden}
      {isSystem && (
        <div role="note" className="rounded-md bg-hover px-3 py-2 text-muted-foreground text-sm">
          {m.settings_presets_system_notice()}
        </div>
      )}

      {errors && errors.length > 0 && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <ul className="flex list-inside list-disc flex-col gap-1">
            {errors.map(message => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{m.settings_presets_form_name_label()}</Label>
        <Input
          id="name"
          name="name"
          defaultValue={preset?.name ?? ''}
          placeholder={placeholders?.name}
          maxLength={80}
          disabled={readOnly}
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <SettingRow htmlFor="allowExternalSpeaker" title={m.settings_presets_form_allow_external()}>
          <Switch
            id="allowExternalSpeaker"
            name="allowExternalSpeaker"
            defaultChecked={preset?.allowExternalSpeaker ?? false}
            disabled={readOnly}
          />
        </SettingRow>
        <SettingRow
          htmlFor="hasReaderSlot"
          title={m.settings_presets_form_has_reader()}
          description={m.settings_presets_form_has_reader_hint()}
        >
          <Switch
            id="hasReaderSlot"
            name="hasReaderSlot"
            checked={hasReaderSlot}
            onCheckedChange={setHasReaderSlot}
            disabled={readOnly}
          />
        </SettingRow>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="speakerLabel">{m.settings_presets_form_speaker_label()}</Label>
          <Input
            id="speakerLabel"
            name="speakerLabel"
            defaultValue={preset?.speakerLabel ?? ''}
            placeholder={placeholders?.speakerLabel || m.settings_presets_form_speaker_placeholder()}
            maxLength={50}
            disabled={readOnly}
          />
        </div>
        {/* Only offered when there is a second slot to name — otherwise it is a
            field that can never apply to anyone. */}
        {hasReaderSlot && (
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="readerLabel">{m.settings_presets_form_reader_label()}</Label>
            <Input
              id="readerLabel"
              name="readerLabel"
              defaultValue={preset?.readerLabel ?? ''}
              placeholder={placeholders?.readerLabel || m.settings_presets_form_reader_placeholder()}
              maxLength={50}
              disabled={readOnly}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="shareMessage">{m.settings_presets_form_message_label()}</Label>
        <Textarea
          ref={messageField}
          id="shareMessage"
          name="shareMessage"
          value={message}
          onChange={event => setMessage(event.target.value)}
          rows={8}
          placeholder={placeholders?.shareMessage}
          maxLength={1000}
          disabled={readOnly}
        />
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-faint text-xs">{m.settings_presets_form_insert()}</span>
            {SHARE_VARIABLES.map(variable => (
              <button
                key={variable}
                type="button"
                onClick={() => insertVariable(variable)}
                className="rounded bg-hover px-1.5 py-0.5 font-mono text-xs outline-none hover:bg-selected focus-visible:ring-2 focus-visible:ring-ring"
              >{`{{${variable}}}`}</button>
            ))}
          </div>
        )}
        <p className="text-faint text-xs">{m.settings_presets_form_message_help()}</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-medium text-sm">{m.settings_presets_form_preview_title()}</p>
        <div className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm">
          {preview || <span className="text-muted-foreground">{m.settings_presets_form_preview_empty()}</span>}
        </div>
      </div>

      {!fetcher && !readOnly && (
        <div>
          <Button type="submit">{m.settings_presets_form_submit()}</Button>
        </div>
      )}
    </FormElement>
  )
}
