import type { DragEndEvent } from '@dnd-kit/core'
import { SidePanel } from '@unitae/ui'
import { CalendarDays, Eye } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import type { RoleOption } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { DiscardChangesDialog, UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { formatEventDate } from '~/shared/utils/event-time'
import { cn } from '~/shared/utils/utils'
import { EventInfoPanel } from './EventInfoPanel'
import { EventProgrammePanel, type PartAssignment, reorderPartIds } from './EventProgrammePanel'
import { EventServicesPanel, type ServicePartAssignment } from './EventServicesPanel'
import { InlineDeleteDialog } from './InlineDeleteDialog'
import { PART_FORM_ID, type PartData, PartEditor, type PartPresetOption, partEditorCopy } from './PartEditor'
import { PartEditSheet } from './PartEditSheet'
import { SERVICE_FORM_ID, ServiceEditor, serviceEditorCopy } from './ServiceEditor'
import { ServiceEditSheet } from './ServiceEditSheet'
import { useCloseOnSave } from './use-close-on-save'
import { useSideEditor } from './use-side-editor'

interface EventEditorProps {
  event: {
    id: number
    name: string
    startDate: Date | string
    endDate: Date | string
    eventParts: (PartAssignment & Pick<PartData, 'speakerLabel' | 'readerLabel'>)[]
    eventServiceParts: ServicePartAssignment[]
  }
  /** The templates the caller may apply: applying one moves the event onto it. */
  templates: { id: number; name: string }[]
  roles: RoleOption[]
  presets: PartPresetOption[]
  sectionSuggestions: string[]
  trackSuggestions: string[]
  timezone: string
  /** Links to the programmes follow their own guard: a template responsible may lack it. */
  canViewPrograms: boolean
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the page wires three panels, a docked or sheet editor and their guards
export function EventEditor({
  event,
  templates,
  roles,
  presets,
  sectionSuggestions,
  trackSuggestions,
  timezone,
  canViewPrograms,
}: EventEditorProps) {
  const infoFetcher = useFetcher()
  const partFetcher = useFetcher()
  const serviceFetcher = useFetcher()
  const deleteFetcher = useFetcher()
  const reorderFetcher = useFetcher()
  const templateFetcher = useFetcher()

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'part' | 'service'; id: number; name: string } | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [infoDirty, setInfoDirty] = useState(false)
  const { blocker, setDirty } = useUnsavedChanges()

  // Read from the loader data, not kept from the click: a move or a save elsewhere shows up in the editor.
  const panel = useSideEditor<'part' | 'service'>(target =>
    target.kind === 'part'
      ? event.eventParts.some(part => part.id === target.id)
      : event.eventServiceParts.some(service => service.id === target.id),
  )
  const editing = panel.target
  const editingPart = editing?.kind === 'part' ? event.eventParts.find(part => part.id === editing.id) : undefined
  const editingService =
    editing?.kind === 'service' ? event.eventServiceParts.find(service => service.id === editing.id) : undefined

  useEffect(() => setDirty(infoDirty || panel.dirty), [infoDirty, panel.dirty, setDirty])

  useCloseOnSave(partFetcher, panel.close)
  useCloseOnSave(serviceFetcher, panel.close)

  function handlePartDragEnd(dragEvent: DragEndEvent) {
    if (!dragEvent.over) return
    const ids = event.eventParts.map(part => part.id)
    const reordered = reorderPartIds(ids, Number(dragEvent.active.id), Number(dragEvent.over.id))
    if (reordered === ids) return
    reorderFetcher.submit(
      { orderedIds: reordered },
      { method: 'POST', action: `/programs/events/${event.id}/reorder-parts`, encType: 'application/json' },
    )
  }

  function handleDelete() {
    if (!deleteTarget) return
    const formData = new FormData()
    if (deleteTarget.type === 'part') {
      formData.set('intent', 'delete-part')
      formData.set('partAssignmentId', String(deleteTarget.id))
    } else {
      formData.set('intent', 'delete-service')
      formData.set('serviceAssignmentId', String(deleteTarget.id))
    }
    if (editing?.kind === deleteTarget.type && editing.id === deleteTarget.id) panel.close()
    deleteFetcher.submit(formData, { method: 'post' })
    setDeleteTarget(null)
  }

  function handleApplyTemplate() {
    if (!selectedTemplateId) return
    const formData = new FormData()
    formData.set('intent', 'apply-template')
    formData.set('templateId', selectedTemplateId)
    templateFetcher.submit(formData, { method: 'post' })
  }

  const partEditor = {
    mode: 'event' as const,
    fetcher: partFetcher,
    part: editingPart ?? null,
    defaultOrder: event.eventParts.length + 1,
    roles,
    presets,
    sectionSuggestions,
    trackSuggestions,
  }
  const serviceEditor = { mode: 'event' as const, fetcher: serviceFetcher, service: editingService ?? null, roles }
  const copy =
    editing?.kind === 'service'
      ? serviceEditorCopy('event', editing.id != null)
      : partEditorCopy('event', editing?.id != null)
  const date = formatEventDate(event.startDate, timezone, getLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    // The marker lets the app shell stop clipping as a scroll container, so the docked editor can stick.
    <div data-sticky-content="" className={cn(infoDirty && 'pb-20')}>
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        icon={CalendarDays}
        title={m.programs_edit_page_title()}
        subtitle={`${event.name} · ${date}`}
        breadcrumbs={[
          { label: m.sidebar_programs(), to: canViewPrograms ? '/programs' : undefined },
          { label: event.name, to: canViewPrograms ? `/programs/events/${event.id}` : undefined },
          { label: m.programs_edit_crumb() },
        ]}
        actions={
          canViewPrograms && (
            <Button asChild variant="ghost">
              <Link to={`/programs/events/${event.id}`}>
                <Eye />
                {m.programs_edit_view_event()}
              </Link>
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[3_1_560px] flex-col gap-6">
          <EventInfoPanel event={event} timezone={timezone} fetcher={infoFetcher} onDirtyChange={setInfoDirty} />
          <EventProgrammePanel
            parts={event.eventParts}
            presetNames={new Map(presets.map(preset => [preset.id, preset.name]))}
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            onTemplateChange={setSelectedTemplateId}
            onApplyTemplate={handleApplyTemplate}
            isApplyingTemplate={templateFetcher.state !== 'idle'}
            selectedId={editing?.kind === 'part' ? editing.id : null}
            dragLocked={panel.dirty}
            onAddPart={trigger => panel.request({ kind: 'part', id: null, trigger })}
            onEditPart={(part, trigger) => panel.request({ kind: 'part', id: part.id, trigger })}
            onDeletePart={target => setDeleteTarget({ type: 'part', ...target })}
            onDragEnd={handlePartDragEnd}
          />
          <EventServicesPanel
            services={event.eventServiceParts}
            roles={roles}
            selectedId={editing?.kind === 'service' ? editing.id : null}
            onAddService={trigger => panel.request({ kind: 'service', id: null, trigger })}
            onEditService={(service, trigger) => panel.request({ kind: 'service', id: service.id, trigger })}
            onDeleteService={target => setDeleteTarget({ type: 'service', ...target })}
          />
        </div>

        {panel.docked && editing != null && (
          <SidePanel
            key={`${editing.kind}-${editing.id ?? 'new'}`}
            title={copy.title}
            description={copy.description}
            closeLabel={m.common_close()}
            onClose={() => panel.request(null)}
            returnFocus={editing.trigger}
            // Clear of the save bar fixed at the bottom while the event's fields hold changes.
            className={cn(infoDirty && '[--side-panel-bottom:5rem]')}
            footer={
              <>
                <Button type="button" variant="ghost" onClick={panel.close}>
                  {m.common_cancel()}
                </Button>
                <SubmitButton
                  form={editing.kind === 'part' ? PART_FORM_ID : SERVICE_FORM_ID}
                  disabled={(editing.kind === 'part' ? partFetcher : serviceFetcher).state !== 'idle'}
                >
                  {m.common_save()}
                </SubmitButton>
              </>
            }
          >
            {editing.kind === 'part' ? (
              // A move changes the part's order: start again from it rather than save the old one back.
              <PartEditor
                key={`${editingPart?.id ?? 'new'}:${editingPart?.order ?? ''}`}
                {...partEditor}
                formRef={panel.formRef}
              />
            ) : (
              <ServiceEditor key={editingService?.id ?? 'new'} {...serviceEditor} formRef={panel.formRef} />
            )}
          </SidePanel>
        )}
      </div>

      {!panel.docked && (
        <>
          <PartEditSheet
            open={editing?.kind === 'part'}
            onOpenChange={next => !next && panel.close()}
            {...partEditor}
          />
          <ServiceEditSheet
            open={editing?.kind === 'service'}
            onOpenChange={next => !next && panel.close()}
            {...serviceEditor}
          />
        </>
      )}

      <DiscardChangesDialog
        {...panel.discard}
        description={m.common_discard_changes_description()}
        discardLabel={m.common_discard_changes_confirm()}
      />

      <InlineDeleteDialog
        open={deleteTarget != null}
        onOpenChange={next => {
          if (!next) setDeleteTarget(null)
        }}
        itemName={deleteTarget?.name ?? ''}
        onConfirm={handleDelete}
        isDeleting={deleteFetcher.state !== 'idle'}
      />
    </div>
  )
}
