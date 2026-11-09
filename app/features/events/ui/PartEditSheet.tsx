import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'
import { PART_FORM_ID, PartEditor, type PartEditorProps, partEditorCopy } from './PartEditor'

interface PartEditSheetProps extends Omit<PartEditorProps, 'formRef' | 'className'> {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** The part editor in a sheet over the page: the template editor, and the event editor on narrow screens. */
export function PartEditSheet({ open, onOpenChange, ...editor }: PartEditSheetProps) {
  useCloseOnSave(editor.fetcher, () => onOpenChange(false))
  const { title, description } = partEditorCopy(editor.mode, editor.part != null)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <PartEditor
          key={`${editor.part?.id ?? 'new'}:${editor.part?.order ?? ''}`}
          {...editor}
          className="flex-1 overflow-y-auto px-4 pb-4"
        />
        <SheetFooter className="flex-row justify-end border-border border-t">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {m.common_cancel()}
          </Button>
          <SubmitButton form={PART_FORM_ID} disabled={editor.fetcher.state !== 'idle'}>
            {m.common_save()}
          </SubmitButton>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
