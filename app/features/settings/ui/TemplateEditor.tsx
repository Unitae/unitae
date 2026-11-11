import type { DragEndEvent } from '@dnd-kit/core'
import { SidePanel } from '@unitae/ui'
import { useEffect, useState } from 'react'
import { useFetcher } from 'react-router'
import {
  EventProgrammePanel,
  EventServicesPanel,
  InlineDeleteDialog,
  PART_FORM_ID,
  type PartAssignment,
  type PartData,
  PartEditor,
  PartEditSheet,
  type PartPresetOption,
  partEditorCopy,
  reorderPartIds,
  SERVICE_FORM_ID,
  ServiceEditor,
  ServiceEditSheet,
  type ServicePartAssignment,
  serviceEditorCopy,
} from '~/features/events'
import * as m from '~/i18n/paraglide/messages'
import type { RoleOption } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { useSideEditor } from '~/shared/ui/hooks/use-side-editor'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { DiscardChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { cn } from '~/shared/utils/utils'

interface TemplateEditorProps {
  templateId: number
  parts: (PartAssignment & Pick<PartData, 'speakerLabel' | 'readerLabel'>)[]
  services: ServicePartAssignment[]
  roles: RoleOption[]
  presets: PartPresetOption[]
  sectionSuggestions: string[]
  trackSuggestions: string[]
  /** May change the parts and the services; otherwise the panels only show them. */
  editable: boolean
  /** The information panel's save bar is up: the docked editor keeps clear of it. */
  infoDirty: boolean
  /** Unsaved changes in the docked editor, for the page's guard. */
  onDirtyChange: (dirty: boolean) => void
}

/**
 * A template's programme and services, as the event editor shows them: parts by section and room, dragged to
 * reorder, each opening beside the list (in a sheet on a narrow screen); services with the roles that may do them.
 */
export function TemplateEditor({
  templateId,
  parts,
  services,
  roles,
  presets,
  sectionSuggestions,
  trackSuggestions,
  editable,
  infoDirty,
  onDirtyChange,
}: TemplateEditorProps) {
  const partFetcher = useFetcher()
  const serviceFetcher = useFetcher()
  const deleteFetcher = useFetcher()
  const reorderFetcher = useFetcher()
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'part' | 'service'; id: number; name: string } | null>(null)

  const panel = useSideEditor<'part' | 'service'>(target =>
    target.kind === 'part'
      ? parts.some(part => part.id === target.id)
      : services.some(service => service.id === target.id),
  )
  const editing = panel.target
  const editingPart = editing?.kind === 'part' ? parts.find(part => part.id === editing.id) : undefined
  const editingService = editing?.kind === 'service' ? services.find(service => service.id === editing.id) : undefined

  useEffect(() => onDirtyChange(panel.dirty), [panel.dirty, onDirtyChange])
  useCloseOnSave(partFetcher, panel.close)
  useCloseOnSave(serviceFetcher, panel.close)

  function handlePartDragEnd(dragEvent: DragEndEvent) {
    if (!dragEvent.over) return
    const ids = parts.map(part => part.id)
    const reordered = reorderPartIds(ids, Number(dragEvent.active.id), Number(dragEvent.over.id))
    if (reordered === ids) return
    reorderFetcher.submit(
      { orderedIds: reordered },
      { method: 'POST', action: `/settings/templates/${templateId}/reorder-parts`, encType: 'application/json' },
    )
  }

  function handleDelete() {
    if (!deleteTarget) return
    const formData = new FormData()
    if (deleteTarget.type === 'part') {
      formData.set('intent', 'delete-part')
      formData.set('partId', String(deleteTarget.id))
    } else {
      formData.set('intent', 'delete-service-role')
      formData.set('roleId', String(deleteTarget.id))
    }
    if (editing?.kind === deleteTarget.type && editing.id === deleteTarget.id) panel.close()
    deleteFetcher.submit(formData, { method: 'post' })
    setDeleteTarget(null)
  }

  const partEditor = {
    mode: 'template' as const,
    fetcher: partFetcher,
    part: editingPart ?? null,
    defaultOrder: parts.length + 1,
    roles,
    presets,
    sectionSuggestions,
    trackSuggestions,
  }
  const serviceEditor = { mode: 'template' as const, fetcher: serviceFetcher, service: editingService ?? null, roles }
  const copy =
    editing?.kind === 'service'
      ? serviceEditorCopy('template', editing.id != null)
      : partEditorCopy('template', editing?.id != null)

  return (
    <>
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[3_1_480px] flex-col gap-6">
          <EventProgrammePanel
            parts={parts}
            presetNames={new Map(presets.map(preset => [preset.id, preset.name]))}
            templates={[]}
            selectedTemplateId=""
            onTemplateChange={() => undefined}
            onApplyTemplate={() => undefined}
            isApplyingTemplate={false}
            selectedId={editing?.kind === 'part' ? editing.id : null}
            dragLocked={panel.dirty}
            readOnly={!editable}
            emptyHint={m.settings_template_parts_empty()}
            onAddPart={trigger => panel.request({ kind: 'part', id: null, trigger })}
            onEditPart={(part, trigger) => panel.request({ kind: 'part', id: part.id, trigger })}
            onDeletePart={target => setDeleteTarget({ type: 'part', ...target })}
            onDragEnd={handlePartDragEnd}
          />
          <EventServicesPanel
            services={services}
            roles={roles}
            readOnly={!editable}
            selectedId={editing?.kind === 'service' ? editing.id : null}
            onAddService={trigger => panel.request({ kind: 'service', id: null, trigger })}
            onEditService={(service, trigger) => panel.request({ kind: 'service', id: service.id, trigger })}
            onDeleteService={target => setDeleteTarget({ type: 'service', ...target })}
          />
        </div>

        {editable && panel.docked && editing != null && (
          <SidePanel
            key={`${editing.kind}-${editing.id ?? 'new'}`}
            title={copy.title}
            description={copy.description}
            closeLabel={m.common_close()}
            onClose={() => panel.request(null)}
            returnFocus={editing.trigger}
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

      {editable && !panel.docked && (
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
        onOpenChange={next => !next && setDeleteTarget(null)}
        itemName={deleteTarget?.name ?? ''}
        onConfirm={handleDelete}
        isDeleting={deleteFetcher.state !== 'idle'}
      />
    </>
  )
}
