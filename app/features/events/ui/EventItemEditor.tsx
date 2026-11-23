import { SidePanel } from '@unitae/ui'
import type { ComponentProps } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import type { useSideEditor } from '~/shared/ui/hooks/use-side-editor'
import { sidePanelWalk } from '~/shared/ui/ListWithPanel'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { ASSIGN_PART_FORM_ID, AssignPartEditor, assignPartCopy } from './AssignPartEditor'
import { AssignPartSheet } from './AssignPartSheet'
import { ASSIGN_SERVICE_FORM_ID, AssignServiceEditor } from './AssignServiceEditor'
import { AssignServiceSheet } from './AssignServiceSheet'
import type { AssignedPart } from './EventAssignmentsPanel'
import type { AssignedService } from './EventServiceAssignmentsPanel'

type SideEditor = ReturnType<typeof useSideEditor<'part' | 'service'>>

interface EventItemEditorProps {
  panel: SideEditor
  part: AssignedPart | undefined
  service: AssignedService | undefined
  /** ↑ ↓ through the items of the open one's kind. */
  walk: ReturnType<SideEditor['walk']>
  partEditor: Omit<ComponentProps<typeof AssignPartEditor>, 'part' | 'formRef'>
  serviceEditor: Omit<ComponentProps<typeof AssignServiceEditor>, 'service' | 'formRef'>
  /** Docked beside the programme on a wide screen, a sheet below. */
  placement: 'docked' | 'sheet'
}

/** The editor of the item the reader opened: who takes a part or a service. */
export function EventItemEditor({
  panel,
  part,
  service,
  walk,
  partEditor,
  serviceEditor,
  placement,
}: EventItemEditorProps) {
  const target = panel.target

  if (placement === 'sheet') {
    if (panel.docked) return null
    return (
      <>
        <AssignPartSheet
          open={part != null}
          onOpenChange={next => !next && panel.close()}
          part={part ?? null}
          {...partEditor}
        />
        <AssignServiceSheet
          open={service != null}
          onOpenChange={next => !next && panel.close()}
          service={service ?? null}
          {...serviceEditor}
        />
      </>
    )
  }

  if (!panel.docked || target == null || (part == null && service == null)) return null
  const partCopy = part ? assignPartCopy(part) : null
  return (
    // `contents` keeps the panel a flex item of the row while its key presses reach the walk.
    // biome-ignore lint/a11y/noStaticElementInteractions: the keys belong to the focusable panel inside
    <div className="contents" onKeyDown={walk?.onKeyDown}>
      <SidePanel
        key={`${target.kind}-${target.id}`}
        title={part ? partCopy?.title : service?.name}
        description={partCopy?.description}
        closeLabel={m.common_close()}
        onClose={() => panel.request(null)}
        returnFocus={target.trigger}
        walk={sidePanelWalk(
          walk,
          part
            ? { previous: m.programs_panel_previous_part(), next: m.programs_panel_next_part() }
            : { previous: m.programs_panel_previous_service(), next: m.programs_panel_next_service() },
        )}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={panel.close}>
              {m.common_cancel()}
            </Button>
            <SubmitButton
              form={part ? ASSIGN_PART_FORM_ID : ASSIGN_SERVICE_FORM_ID}
              disabled={(part ? partEditor.fetcher : serviceEditor.fetcher).state !== 'idle'}
            >
              {m.common_save()}
            </SubmitButton>
          </>
        }
      >
        {part ? (
          <AssignPartEditor key={part.id} part={part} {...partEditor} formRef={panel.formRef} />
        ) : (
          service && (
            <AssignServiceEditor key={service.id} service={service} {...serviceEditor} formRef={panel.formRef} />
          )
        )}
      </SidePanel>
    </div>
  )
}
