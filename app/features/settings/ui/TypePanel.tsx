import { Callout, SidePanel } from '@unitae/ui'
import { Copy, MoreHorizontal, Trash2 } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useFetcher } from 'react-router'
import type { TypePanelData } from '~/features/settings/server/type-panel.queries'
import { ConfirmDialog } from '~/features/settings/ui/ConfirmDialog'
import { TemplateInfoFields } from '~/features/settings/ui/TemplateInfoFields'
import { TemplateSchedules } from '~/features/settings/ui/TemplateSchedules'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'

const FORM_ID = 'type-panel-form'

interface TypePanelProps {
  type: TypePanelData
  docked: boolean
  onClose: () => void
  /** The type's fields hold changes not saved yet. */
  onDirtyChange: (dirty: boolean) => void
}

/**
 * One meeting type in the side panel of « Types d’évènement » (board TourA-Reglages-Types, 6b-2b): docked beside the
 * list from 1280 px, a sheet below. Its name, day, hours, colour and attendance, saved from the footer once changed;
 * the schedule templates it uses; « Dupliquer » in its menu and « Supprimer le type » in its footer. A built-in type
 * takes its colour only.
 */
export function TypePanel(props: TypePanelProps) {
  const [version, setVersion] = useState(0)
  // A new starting point after « Annuler », and once a save brings the saved values back.
  const key = [props.type.id, version, JSON.stringify(props.type.template)].join('|')
  return <TypePanelContent key={key} {...props} onCancel={() => setVersion(current => current + 1)} />
}

function TypePanelContent({
  type,
  docked,
  onClose,
  onDirtyChange,
  onCancel,
}: TypePanelProps & { onCancel: () => void }) {
  const infoFetcher = useFetcher()
  const menuFetcher = useFetcher()
  const moveFetcher = useFetcher()
  const { ref, changes } = useFormChanges()
  const [deleting, setDeleting] = useState(false)
  useEffect(() => onDirtyChange(changes > 0), [changes, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const { template, builtIn, eventCount, meetingsToMove } = type
  const description = builtIn
    ? m.settings_template_built_in_subtitle()
    : eventCount > 0
      ? m.settings_template_page_used({ count: eventCount })
      : m.settings_template_page_subtitle()
  const intent = (name: string) => ({ intent: name, typeId: String(type.id) })

  const actions = !builtIn && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={m.common_more_actions()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-72">
        {/* The copy is made from what is saved: not while changes wait, which it would silently leave out. */}
        <DropdownMenuItem
          disabled={changes > 0}
          onSelect={() => menuFetcher.submit(intent('duplicate'), { method: 'post' })}
        >
          <Copy />
          {m.settings_template_duplicate()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const footer = (
    <>
      {/* Only while nothing is being edited, and for a type no programme uses: the panel says why otherwise. */}
      {!builtIn && eventCount === 0 && changes === 0 && (
        <Button variant="ghost" size="sm" className="mr-auto text-danger-text" onClick={() => setDeleting(true)}>
          <Trash2 />
          {m.settings_template_delete()}
        </Button>
      )}
      {changes > 0 && (
        <>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {m.common_cancel()}
          </Button>
          <SubmitButton form={FORM_ID} disabled={infoFetcher.state !== 'idle'}>
            {m.common_save()}
          </SubmitButton>
        </>
      )}
    </>
  )

  // A built-in type with nothing to save has no footer: an empty bar says nothing.
  const hasFooter = changes > 0 || (!builtIn && eventCount === 0)
  const body: ReactNode = (
    <div className="flex flex-col gap-6">
      {/* Hidden while the day or hours are being edited: the count is for what is saved. */}
      {meetingsToMove > 0 && changes === 0 && (
        <Callout
          tone="info"
          title={m.settings_template_move_meetings_title({ count: meetingsToMove })}
          action={
            <Button
              size="sm"
              variant="outline"
              disabled={moveFetcher.state !== 'idle'}
              onClick={() => moveFetcher.submit(intent('move-meetings'), { method: 'post' })}
            >
              {m.settings_template_move_meetings_button({ count: meetingsToMove })}
            </Button>
          }
        >
          {m.settings_template_move_meetings_body()}
        </Callout>
      )}
      <TemplateInfoFields
        formId={FORM_ID}
        formRef={ref}
        typeId={type.id}
        template={template}
        builtIn={builtIn}
        manager
        editable
        fetcher={infoFetcher}
      />
      {!builtIn && eventCount > 0 && (
        <p className="text-faint text-xs">{m.settings_template_delete_in_use({ count: eventCount })}</p>
      )}
      {builtIn ? (
        <p className="text-muted-foreground text-sm">{m.settings_template_system_body_freeform()}</p>
      ) : (
        <TemplateSchedules typeId={type.id} rows={type.schedules} candidates={type.candidates} editable />
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={m.settings_template_delete_title()}
        description={m.settings_template_delete_description({ name: template.name })}
        confirmLabel={m.common_delete()}
        destructive
        onConfirm={() => menuFetcher.submit(intent('delete'), { method: 'post' })}
      />
    </div>
  )

  if (docked) {
    return (
      <SidePanel
        title={template.name}
        description={description}
        closeLabel={m.common_close()}
        onClose={onClose}
        actions={actions}
        footer={hasFooter ? footer : undefined}
        className="xl:w-[420px] xl:shrink-0"
      >
        {body}
      </SidePanel>
    )
  }
  return (
    <Sheet open onOpenChange={next => !next && onClose()}>
      <SheetContent data-type-sheet="" className="sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center gap-2 pr-10">
            <SheetTitle className="flex-1">{template.name}</SheetTitle>
            {actions}
          </div>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-4 pb-4">{body}</div>
        {hasFooter && (
          <SheetFooter className="flex-row flex-wrap justify-end border-border border-t">{footer}</SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
