import { SidePanel } from '@unitae/ui'
import { ChevronLeft, MoreHorizontal } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import {
  InlineDeleteDialog,
  PART_FORM_ID,
  PartEditor,
  partEditorCopy,
  SERVICE_FORM_ID,
  ServiceEditor,
  serviceEditorCopy,
} from '~/features/events'
import type { ScheduleTemplateView } from '~/features/settings/model/schedule-template-view'
import { ScheduleTemplateForm } from '~/features/settings/ui/ScheduleTemplateForm'
import { itemMark, ScheduleTemplateItemList } from '~/features/settings/ui/ScheduleTemplateItemList'
import type { OpenItem } from '~/features/settings/ui/use-schedule-template-page'
import * as m from '~/i18n/paraglide/messages'
import type { RoleOption } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'

const FORM_ID = 'schedule-template-form'

/** A schedule template's items as its panel shows and edits them (getScheduleTemplateItems, serialised). */
export interface PanelItems {
  kindId: number | null
  parts: (React.ComponentProps<typeof PartEditor>['part'] & {
    id: number
    allowedSpeakerRoleIds: number[]
    allowedReaderRoleIds: number[]
  } & { trackOrder: number | null })[]
  services: { id: number; name: string; key: string; allowedRoleIds: number[] }[]
  roles: RoleOption[]
  presets: React.ComponentProps<typeof PartEditor>['presets']
  sectionSuggestions: string[]
  trackSuggestions: string[]
}

/**
 * One schedule template in the side panel (docked from 1280 px, a sheet below), on two levels: its name, responsible
 * and items, then one item's form in the same panel (design round A, « TourA-Modeles-Programme » and « -Partie »).
 * The list applies at once; the name and responsible save from a footer shown once one of them changed; the item's
 * form saves with its own. The panel stays mounted from one level to the other, so focus follows the level.
 */
export function ScheduleTemplatePanel({
  template,
  roles,
  items,
  item,
  docked,
  errors,
  fetcher,
  onClose,
  onOpenItem,
  onBack,
  onLeaveItem,
  onDirtyChange,
}: {
  template: ScheduleTemplateView
  roles: { id: number; label: string }[]
  items: PanelItems | null
  item: OpenItem | null
  docked: boolean
  errors: string[] | undefined
  fetcher: ReturnType<typeof useFetcher>
  onClose: () => void
  onOpenItem: (item: OpenItem) => void
  onBack: () => void
  onLeaveItem: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const fields = useFormChanges()
  const itemForm = useFormChanges()
  const itemFetcher = useFetcher()
  const deleteFetcher = useFetcher()
  const [version, setVersion] = useState(0)
  const [deleting, setDeleting] = useState(false)
  useCloseOnSave(itemFetcher, onLeaveItem)
  useCloseOnSave(deleteFetcher, onLeaveItem)

  const part = item?.kind === 'part' && item.id != null ? items?.parts.find(each => each.id === item.id) : undefined
  const service =
    item?.kind === 'service' && item.id != null ? items?.services.find(each => each.id === item.id) : undefined
  const dirty = item == null ? fields.changes > 0 : itemForm.changes > 0
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  // The row the item was opened from gets focus back: read on the way back, its list renders anew.
  const left = useRef<string | null>(null)
  if (item?.id != null) left.current = itemMark(item.kind, item.id)

  const description =
    template.schedules === 0
      ? m.settings_schedule_templates_used_none()
      : m.settings_schedule_templates_used({ count: template.schedules })
  const copy =
    item?.kind === 'service'
      ? serviceEditorCopy('template', item.id != null)
      : partEditorCopy('template', item?.id != null)
  const title =
    item == null ? template.title : item.kind === 'part' ? (part?.name ?? copy.title) : (service?.name ?? copy.title)

  const levelOne = (
    <div className="flex flex-col gap-6">
      <ScheduleTemplateForm
        key={`${template.id}-${version}`}
        template={template}
        roles={roles}
        errors={errors}
        fetcher={fetcher as never}
        id={FORM_ID}
        formRef={fields.ref}
      />
      {items == null || items.kindId == null ? (
        <p className="text-muted-foreground text-sm">{m.settings_schedule_templates_no_kind()}</p>
      ) : (
        <ScheduleTemplateItemList
          kind={template.kind === 'duty' ? 'service' : 'part'}
          parts={items.parts}
          services={items.services}
          roles={items.roles}
          onOpen={(kind, id) => onOpenItem({ kind, id })}
          onAdd={(kind, draft) => onOpenItem({ kind, id: null, draft })}
        />
      )}
    </div>
  )
  const levelTwo =
    item == null || items == null ? null : item.kind === 'part' ? (
      <PartEditor
        key={`part-${item.id ?? `new-${item.draft?.section}-${item.draft?.track}-${item.draft?.order}`}`}
        mode="template"
        fetcher={itemFetcher}
        part={
          part ??
          (item.draft == null
            ? null
            : {
                name: '',
                section: item.draft.section,
                track: item.draft.track,
                trackOrder: item.draft.trackOrder,
                order: item.draft.order,
                durationMin: null,
                presetId: null,
                allowedSpeakerRoleIds: [],
                allowedReaderRoleIds: [],
              })
        }
        defaultOrder={items.parts.length + 1}
        roles={items.roles}
        presets={items.presets}
        sectionSuggestions={items.sectionSuggestions}
        trackSuggestions={items.trackSuggestions}
        formRef={itemForm.ref}
      />
    ) : (
      <ServiceEditor
        key={`service-${item.id ?? 'new'}`}
        mode="template"
        fetcher={itemFetcher}
        service={service ?? null}
        roles={items.roles}
        formRef={itemForm.ref}
      />
    )

  const footer: ReactNode =
    item != null ? (
      <>
        <Button type="button" variant="ghost" onClick={onBack}>
          {m.common_cancel()}
        </Button>
        <SubmitButton
          form={item.kind === 'part' ? PART_FORM_ID : SERVICE_FORM_ID}
          disabled={itemFetcher.state !== 'idle'}
        >
          {item.kind === 'part'
            ? m.settings_schedule_templates_save_part()
            : m.settings_schedule_templates_save_service()}
        </SubmitButton>
      </>
    ) : fields.changes > 0 ? (
      <>
        <Button type="button" variant="ghost" onClick={() => setVersion(current => current + 1)}>
          {m.common_cancel()}
        </Button>
        <SubmitButton form={FORM_ID} disabled={fetcher.state !== 'idle'}>
          {m.common_save()}
        </SubmitButton>
      </>
    ) : undefined
  const actions =
    item?.id != null ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={m.common_more_actions()}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            {m.common_delete()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : undefined
  const back = { label: template.title, onClick: onBack, returnFocus: () => rowOf(left.current) }

  function confirmDelete() {
    if (item?.id == null) return
    const formData = new FormData()
    formData.set('intent', item.kind === 'part' ? 'delete-part' : 'delete-service-role')
    formData.set(item.kind === 'part' ? 'partId' : 'roleId', String(item.id))
    deleteFetcher.submit(formData, { method: 'post' })
    setDeleting(false)
  }

  return (
    <>
      {docked ? (
        <SidePanel
          title={title}
          description={item == null ? description : copy.description}
          closeLabel={m.common_close()}
          onClose={onClose}
          back={item == null ? undefined : back}
          actions={actions}
          footer={footer}
        >
          {item == null ? levelOne : levelTwo}
        </SidePanel>
      ) : (
        <Sheet open onOpenChange={next => !next && onClose()}>
          <SheetContent
            className="sm:max-w-md"
            onEscapeKeyDown={event => {
              if (item == null) return
              event.preventDefault()
              onBack()
            }}
          >
            <SheetHeader>
              {item != null && (
                <Button type="button" variant="ghost" size="sm" className="-ml-2 min-h-11 self-start" onClick={onBack}>
                  <ChevronLeft aria-hidden="true" />
                  {template.title}
                </Button>
              )}
              <div className="flex items-center gap-2">
                <SheetTitle className="flex-1">{title}</SheetTitle>
                {actions}
              </div>
              <SheetDescription>{item == null ? description : copy.description}</SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-4 pb-4">{item == null ? levelOne : levelTwo}</div>
            {footer != null && (
              <SheetFooter className="flex-row justify-end border-border border-t">{footer}</SheetFooter>
            )}
          </SheetContent>
        </Sheet>
      )}
      <InlineDeleteDialog
        open={deleting}
        onOpenChange={next => !next && setDeleting(false)}
        itemName={title}
        onConfirm={confirmDelete}
        isDeleting={deleteFetcher.state !== 'idle'}
      />
    </>
  )
}

function rowOf(mark: string | null): HTMLElement | null {
  return mark == null ? null : document.querySelector<HTMLElement>(`[data-item="${mark}"]`)
}
