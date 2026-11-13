import { FactList, Status } from '@unitae/ui'
import { Ellipsis, FileText, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import type { DirectoryCongregation } from '~/features/events/model/external-speaker.type'
import { formatSpeakerDate } from '~/features/events/model/speaker-dates'
import { isListStale } from '~/features/events/model/speaker-directory'
import * as m from '~/i18n/paraglide/messages'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import { DirectoryPanelFrame, PanelSection } from './DirectoryPanelFrame'
import { CONGREGATION_FORM_ID, refusalMessage, SpeakerCongregationForm } from './SpeakerCongregationForm'

// A congregation whose list we receive: its two contacts, the date and PDF of its latest list, notes. « Mettre à jour
// la liste » leads to the import screen; « Modifier » edits the contacts in place.

/** Null when nobody is recorded, so the list shows « À compléter » instead. */
function contact(name: string, phone: string, email: string) {
  if (name === '' && phone === '' && email === '') return null
  return (
    <span className="flex flex-col gap-0.5">
      {name && <span>{name}</span>}
      {phone && (
        <a href={`tel:${phone.replaceAll(' ', '')}`} className="tabular-nums hover:underline">
          {phone}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className="hover:underline">
          {email}
        </a>
      )}
    </span>
  )
}

function DeleteCongregationDialog({
  congregation,
  onOpenChange,
}: {
  congregation: DirectoryCongregation
  onOpenChange: (open: boolean) => void
}) {
  const fetcher = useFetcher()
  useCloseOnSave(fetcher, () => onOpenChange(false))
  const error = refusalMessage(fetcher.data)
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {m.external_speakers_congregation_delete_title({ name: congregation.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>{m.external_speakers_congregation_delete_body()}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-danger-text text-sm">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="congregation-delete" />
            <input type="hidden" name="speakerCongregationId" value={congregation.id} />
            <Button type="submit" variant="destructive" disabled={fetcher.state !== 'idle'}>
              {m.external_speakers_congregation_delete()}
            </Button>
          </fetcher.Form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function SpeakerCongregationPanel({
  congregation,
  speakerCount,
  timezone,
  canManage,
  docked,
  returnFocus,
  onClose,
  onDirtyChange,
}: {
  congregation: DirectoryCongregation
  /** Speakers still in it, retired ones included: it can be deleted only once none is left. */
  speakerCount: { onList: number; all: number }
  timezone: string
  canManage: boolean
  docked: boolean
  returnFocus: HTMLElement | null
  onClose: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const fetcher = useFetcher()
  const form = useFormChanges()
  useCloseOnSave(fetcher, () => setEditing(false))
  const dirty = editing && form.changes > 0
  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  const footer = editing ? (
    <div className="flex w-full items-center gap-2">
      <span className="text-muted-foreground flex-1 text-sm" aria-live="polite">
        {form.changes === 0
          ? null
          : form.changes === 1
            ? m.form_changes_one({ count: '1' })
            : m.form_changes_many({ count: String(form.changes) })}
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
        {m.common_cancel()}
      </Button>
      <Button type="submit" size="sm" form={CONGREGATION_FORM_ID} disabled={fetcher.state !== 'idle'}>
        {m.common_save()}
      </Button>
    </div>
  ) : undefined
  // Only a congregation with no speaker at all can go; until then the menu would be empty.
  const actions =
    !editing && canManage ? (
      <>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
          <Pencil aria-hidden="true" />
          {m.external_speakers_edit()}
        </Button>
        {speakerCount.all === 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={m.external_speakers_more_actions({ name: congregation.name })}
              >
                <Ellipsis aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                <Trash2 aria-hidden="true" />
                {m.external_speakers_congregation_delete()}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </>
    ) : undefined

  const stale = isListStale(congregation.listDate)
  return (
    <>
      <DirectoryPanelFrame
        docked={docked}
        title={editing ? m.external_speakers_congregation_form_title() : congregation.name}
        description={
          editing ? congregation.name : m.external_speakers_congregation_count({ count: String(speakerCount.onList) })
        }
        actions={actions}
        footer={footer}
        returnFocus={returnFocus}
        onClose={onClose}
      >
        {editing ? (
          <SpeakerCongregationForm congregation={congregation} fetcher={fetcher} formRef={form.ref} />
        ) : (
          <div className="divide-border flex flex-col divide-y">
            <PanelSection title={m.external_speakers_contacts_title()}>
              <FactList
                emptyLabel={<span className="text-faint">{m.external_speakers_contact_missing()}</span>}
                facts={[
                  {
                    label: m.external_speakers_responsible(),
                    value: contact(
                      congregation.responsibleName,
                      congregation.responsiblePhone,
                      congregation.responsibleEmail,
                    ),
                  },
                  {
                    label: m.external_speakers_coordinator(),
                    value: contact(
                      congregation.coordinatorName,
                      congregation.coordinatorPhone,
                      congregation.coordinatorEmail,
                    ),
                  },
                ]}
              />
            </PanelSection>
            <PanelSection title={m.external_speakers_lists_title()}>
              <FactList
                facts={[
                  {
                    label: m.external_speakers_list_received(),
                    value: congregation.listDate ? (
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {m.external_speakers_list_of({ date: formatSpeakerDate(congregation.listDate, timezone) })}
                        {congregation.listFileName && (
                          <a
                            href={`/programs/external-speakers/congregations/${congregation.id}/list-pdf`}
                            className="text-primary inline-flex items-center gap-1 hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FileText aria-hidden="true" className="size-3.5" />
                            {m.external_speakers_list_pdf()}
                          </a>
                        )}
                        {stale && <Status tone="warning">{m.external_speakers_group_stale()}</Status>}
                      </span>
                    ) : (
                      <span className="text-faint">{m.external_speakers_list_none()}</span>
                    ),
                  },
                ]}
              />
              {canManage && (
                <>
                  <Button asChild variant="outline" size="sm" className="self-start max-md:hidden">
                    <Link to={`/programs/external-speakers/congregations/${congregation.id}/update`}>
                      <RefreshCw aria-hidden="true" />
                      {m.external_speakers_update_list()}
                    </Link>
                  </Button>
                  <p className="text-faint text-xs md:hidden">{m.external_speakers_update_list_desktop()}</p>
                </>
              )}
            </PanelSection>
            {congregation.notes && (
              <PanelSection title={m.external_speakers_congregation_notes()}>
                <p className="text-muted-foreground text-sm whitespace-pre-line">{congregation.notes}</p>
              </PanelSection>
            )}
          </div>
        )}
      </DirectoryPanelFrame>
      {deleting && <DeleteCongregationDialog congregation={congregation} onOpenChange={setDeleting} />}
    </>
  )
}
