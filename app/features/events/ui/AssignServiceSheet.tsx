import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'
import { ASSIGN_SERVICE_FORM_ID, AssignServiceEditor, type AssignServiceEditorProps } from './AssignServiceEditor'
import { useCloseOnSave } from './use-close-on-save'

interface AssignServiceSheetProps extends Omit<AssignServiceEditorProps, 'formRef' | 'className' | 'service'> {
  open: boolean
  onOpenChange: (open: boolean) => void
  service: AssignServiceEditorProps['service'] | null
}

/** The service assignment in a sheet over the page, on screens too narrow to dock it. */
export function AssignServiceSheet({ open, onOpenChange, service, ...editor }: AssignServiceSheetProps) {
  useCloseOnSave(editor.fetcher, () => onOpenChange(false))
  if (service == null) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{service.name}</SheetTitle>
        </SheetHeader>
        <AssignServiceEditor
          key={service.id}
          service={service}
          {...editor}
          className="flex-1 overflow-y-auto px-4 pb-4"
        />
        <SheetFooter className="flex-row justify-end border-border border-t">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {m.common_cancel()}
          </Button>
          <SubmitButton form={ASSIGN_SERVICE_FORM_ID} disabled={editor.fetcher.state !== 'idle'}>
            {m.common_save()}
          </SubmitButton>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
