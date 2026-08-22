import { useState } from 'react'
import { Form } from 'react-router'
import { renderShareMessage, SHARE_VARIABLES, type ShareMessageContext } from '~/features/events/model/share-message'
import type { PartPresetFormValues } from '~/features/events/schemas/part-preset.schema'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Checkbox } from '~/shared/ui/checkbox'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { type RoleOption, RolePicker } from '~/shared/ui/RolePicker'
import { Textarea } from '~/shared/ui/textarea'

type PartPresetFormProps = {
  // Derived from the schema rather than restated, so the form cannot drift
  // from what the action will accept.
  preset: PartPresetFormValues | null
  isSystem: boolean
  roles: RoleOption[]
  // Absent means no error. A separate null state would say nothing extra.
  errors?: string[]
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
  link: 'https://unitae.app/board',
}

export function PartPresetForm({ preset, isSystem, roles, errors }: PartPresetFormProps) {
  const [message, setMessage] = useState(preset?.shareMessage ?? '')
  const [hasReaderSlot, setHasReaderSlot] = useState(preset?.hasReaderSlot ?? false)

  // Rendered with renderShareMessage — the same function the share button will
  // use once it exists, which is the point of keeping that module pure: the
  // preview and the sent message cannot diverge.
  const preview = renderShareMessage(message, PREVIEW_CONTEXT)

  return (
    <Form method="post" className="flex flex-col gap-6">
      {isSystem && (
        <div role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
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
        <Input id="name" name="name" defaultValue={preset?.name ?? ''} required maxLength={80} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="allowExternalSpeaker"
            name="allowExternalSpeaker"
            defaultChecked={preset?.allowExternalSpeaker ?? false}
          />
          <Label htmlFor="allowExternalSpeaker">{m.settings_presets_form_allow_external()}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="hasReaderSlot"
            name="hasReaderSlot"
            checked={hasReaderSlot}
            onCheckedChange={value => setHasReaderSlot(value === true)}
          />
          <Label htmlFor="hasReaderSlot">{m.settings_presets_form_has_reader()}</Label>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="speakerLabel">{m.settings_presets_form_speaker_label()}</Label>
          <Input
            id="speakerLabel"
            name="speakerLabel"
            defaultValue={preset?.speakerLabel ?? ''}
            placeholder={m.settings_presets_form_speaker_placeholder()}
            maxLength={50}
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
              placeholder={m.settings_presets_form_reader_placeholder()}
              maxLength={50}
            />
          </div>
        )}
      </div>

      {/* Eligibility belongs to the kind, so it is set once here rather than
          repeated on every part that uses it. An empty selection means any
          member — that is the widest setting, not the narrowest. */}
      <div className="flex flex-col gap-2">
        <Label>{m.settings_presets_form_speaker_roles()}</Label>
        <RolePicker
          roles={roles}
          selectedIds={preset?.allowedSpeakerRoleIds ?? []}
          name="allowedSpeakerRoleIds"
          idPrefix="preset-speaker"
          defaultLabel={m.settings_presets_form_roles_any()}
        />
      </div>

      {hasReaderSlot && (
        <div className="flex flex-col gap-2">
          <Label>{m.settings_presets_form_reader_roles()}</Label>
          <RolePicker
            roles={roles}
            selectedIds={preset?.allowedReaderRoleIds ?? []}
            name="allowedReaderRoleIds"
            idPrefix="preset-reader"
            defaultLabel={m.settings_presets_form_roles_any()}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="shareMessage">{m.settings_presets_form_message_label()}</Label>
        <Textarea
          id="shareMessage"
          name="shareMessage"
          value={message}
          onChange={event => setMessage(event.target.value)}
          rows={10}
          required
          maxLength={1000}
        />
        <p className="text-muted-foreground text-xs">{m.settings_presets_form_message_help()}</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-medium text-sm">{m.settings_presets_form_variables_title()}</p>
        <div className="flex flex-wrap gap-1">
          {SHARE_VARIABLES.map(variable => (
            <code key={variable} className="rounded bg-muted px-1.5 py-0.5 text-xs">{`{{${variable}}}`}</code>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-medium text-sm">{m.settings_presets_form_preview_title()}</p>
        <div className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm">
          {preview || <span className="text-muted-foreground">{m.settings_presets_form_preview_empty()}</span>}
        </div>
      </div>

      <div>
        <Button type="submit">{m.settings_presets_form_submit()}</Button>
      </div>
    </Form>
  )
}
