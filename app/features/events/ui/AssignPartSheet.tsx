import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'
import { ASSIGN_PART_FORM_ID, AssignPartEditor, type AssignPartEditorProps, assignPartCopy } from './AssignPartEditor'
import { useCloseOnSave } from './use-close-on-save'

interface AssignPartSheetProps extends Omit<AssignPartEditorProps, 'formRef' | 'className' | 'part'> {
  open: boolean
  onOpenChange: (open: boolean) => void
  part: AssignPartEditorProps['part'] | null
}

/** The part assignment in a sheet over the page, on screens too narrow to dock it beside the programme. */
export function AssignPartSheet({ open, onOpenChange, part, ...editor }: AssignPartSheetProps) {
  useCloseOnSave(editor.fetcher, () => onOpenChange(false))
  if (part == null) return null
  const { title, description } = assignPartCopy(part)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <AssignPartEditor key={part.id} part={part} {...editor} className="flex-1 overflow-y-auto px-4 pb-4" />
        <SheetFooter className="flex-row justify-end border-border border-t">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {m.common_cancel()}
          </Button>
          <SubmitButton form={ASSIGN_PART_FORM_ID} disabled={editor.fetcher.state !== 'idle'}>
            {m.common_save()}
          </SubmitButton>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
