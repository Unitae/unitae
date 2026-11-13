import { type SidePanelWalk, Status, Tag } from '@unitae/ui'
import { Copy, Ellipsis, UserMinus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'
import type {
  DirectoryCongregation,
  DirectorySpeaker,
  SpeakerVisits,
} from '~/features/events/model/external-speaker.type'
import { formatSpeakerDate } from '~/features/events/model/speaker-dates'
import { isResponsible } from '~/features/events/model/speaker-directory'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import { DirectoryPanelFrame } from './DirectoryPanelFrame'
import { DeleteSpeakerDialog, RetireSpeakerDialog } from './SpeakerDialogs'
import { SPEAKER_FORM_ID, SpeakerForm } from './SpeakerForm'
import { SpeakerView } from './SpeakerView'

// One speaker beside the list: how to reach him, his talks, his visits here. « Modifier » turns the panel into the
// form; a new speaker opens straight on it. A reader sees the sheet without a single control.

export function SpeakerPanel({
  speaker,
  congregation,
  congregations,
  visits,
  defaultCongregationId,
  timezone,
  canManage,
  docked,
  startEditing,
  returnFocus,
  walk,
  onClose,
  onOpenCongregation,
  onCreated,
  onDirtyChange,
}: {
  /** Null while creating a new speaker. */
  speaker: DirectorySpeaker | null
  congregation: DirectoryCongregation | null
  congregations: DirectoryCongregation[]
  visits: SpeakerVisits | null
  defaultCongregationId: number | null
  timezone: string
  canManage: boolean
  docked: boolean
  startEditing: boolean
  returnFocus: HTMLElement | null
  /** The walk through the list as the page shows it. */
  walk?: SidePanelWalk
  onClose: () => void
  onOpenCongregation: (id: number) => void
  onCreated: (speakerId: number) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const [editing, setEditing] = useState(speaker == null || (startEditing && canManage))
  const [dialog, setDialog] = useState<'retire' | 'delete' | null>(null)
  const fetcher = useFetcher()
  const restore = useFetcher()
  const form = useFormChanges()
  useCloseOnSave(fetcher, () => {
    const created = (fetcher.data as { speakerId?: number } | undefined)?.speakerId
    if (speaker == null && created != null) onCreated(created)
    else setEditing(false)
  })
  const dirty = editing && form.changes > 0
  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  const cancel = () => (speaker == null ? onClose() : setEditing(false))
  const busy = fetcher.state !== 'idle'
  const footer = editing ? (
    <div className="flex w-full items-center gap-2">
      <span className="text-muted-foreground flex-1 text-sm" aria-live="polite">
        {form.changes === 0
          ? null
          : form.changes === 1
            ? m.form_changes_one({ count: '1' })
            : m.form_changes_many({ count: String(form.changes) })}
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={cancel}>
        {m.common_cancel()}
      </Button>
      <Button type="submit" size="sm" form={SPEAKER_FORM_ID} disabled={busy}>
        {speaker == null ? m.external_speakers_form_submit_new() : m.common_save()}
      </Button>
    </div>
  ) : canManage && speaker != null && speaker.retiredAt == null ? (
    <div className="flex w-full items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
        {m.external_speakers_edit()}
      </Button>
      <span className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={m.external_speakers_more_actions({ name: speaker.name })}
          >
            <Ellipsis aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {speaker.phone && (
            <DropdownMenuItem
              onSelect={() => {
                void navigator.clipboard?.writeText(speaker.phone ?? '')
                toast.success(m.external_speakers_phone_copied())
              }}
            >
              <Copy aria-hidden="true" />
              {m.external_speakers_copy_phone()}
            </DropdownMenuItem>
          )}
          {speaker.phone && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={() => setDialog('retire')}>
            <UserMinus aria-hidden="true" />
            {m.external_speakers_retire_action()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ) : undefined

  const title =
    speaker == null
      ? m.external_speakers_form_new_title()
      : editing
        ? m.external_speakers_form_edit_title()
        : speaker.name
  const description =
    speaker == null ? (
      m.external_speakers_form_new_description()
    ) : editing ? (
      speaker.name
    ) : (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {congregation ? (
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => onOpenCongregation(congregation.id)}
          >
            {congregation.name}
          </button>
        ) : (
          <span>{m.external_speakers_group_none()}</span>
        )}
        {speaker.retiredAt != null && (
          <Status tone="neutral">
            {m.external_speakers_retired_on({ date: formatSpeakerDate(speaker.retiredAt, timezone) })}
          </Status>
        )}
        {isResponsible(speaker, congregation) && <Tag>{m.external_speakers_tag_responsible()}</Tag>}
      </span>
    )

  return (
    <>
      <DirectoryPanelFrame
        docked={docked}
        title={title}
        description={description}
        footer={footer}
        returnFocus={returnFocus}
        walk={walk}
        onClose={onClose}
      >
        {editing ? (
          <SpeakerForm
            speaker={speaker}
            congregations={congregations}
            defaultCongregationId={defaultCongregationId}
            fetcher={fetcher}
            formRef={form.ref}
          />
        ) : (
          speaker && (
            <SpeakerView
              speaker={speaker}
              congregation={congregation}
              visits={visits}
              timezone={timezone}
              canManage={canManage}
              onRestore={() =>
                restore.submit({ intent: 'speaker-restore', speakerId: String(speaker.id) }, { method: 'post' })
              }
              onDelete={() => setDialog('delete')}
            />
          )
        )}
      </DirectoryPanelFrame>
      {speaker && dialog === 'retire' && (
        <RetireSpeakerDialog
          speaker={speaker}
          congregationName={congregation?.name ?? null}
          visits={visits}
          timezone={timezone}
          onOpenChange={open => !open && setDialog(null)}
        />
      )}
      {speaker && dialog === 'delete' && (
        <DeleteSpeakerDialog
          speaker={speaker}
          congregationName={congregation?.name ?? null}
          visits={visits}
          timezone={timezone}
          onOpenChange={open => !open && setDialog(null)}
        />
      )}
    </>
  )
}
