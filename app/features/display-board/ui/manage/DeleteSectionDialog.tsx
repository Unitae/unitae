import { useEffect, useState } from 'react'
import { Form, useFetcher } from 'react-router'

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
import { Label } from '~/shared/ui/label'
import { RadioGroup, RadioGroupItem } from '~/shared/ui/radio-group'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { Skeleton } from '~/shared/ui/skeleton'

interface SectionDeletion {
  section: { id: number; name: string }
  documents: number
  targets: { id: number; name: string }[]
}

/**
 * « Supprimer la section … ? », from the section's « … » or its edit page. Asks the section's own route how many
 * documents it holds, offers to move them to another section or delete them with it, then posts the choice.
 */
export function DeleteSectionDialog({
  section,
  onClose,
}: {
  section: { id: number; name: string } | null
  onClose: () => void
}) {
  const preview = useFetcher<SectionDeletion>()
  const { load } = preview
  useEffect(() => {
    if (section != null) load(`/board/sections/${section.id}/delete?preview`)
  }, [section, load])
  const deletion = preview.data?.section.id === section?.id ? preview.data : undefined

  return (
    <AlertDialog open={section != null} onOpenChange={open => !open && onClose()}>
      <AlertDialogContent>
        {section && (
          <Form method="post" action={`/board/sections/${section.id}/delete`} className="flex flex-col gap-4">
            <AlertDialogHeader>
              <AlertDialogTitle>{m.board_section_delete_title({ name: section.name })}</AlertDialogTitle>
              <AlertDialogDescription>
                {deletion ? holdsText(deletion.documents) : <Skeleton className="h-4 w-48" />}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deletion != null && deletion.documents > 0 && <ContentsChoice targets={deletion.targets} />}
            <AlertDialogFooter>
              <AlertDialogCancel type="button">{m.common_cancel()}</AlertDialogCancel>
              <SubmitButton variant="destructive" disabled={deletion == null}>
                {m.board_sections_delete_button()}
              </SubmitButton>
            </AlertDialogFooter>
          </Form>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function holdsText(count: number) {
  if (count === 0) return m.board_section_delete_empty()
  return count === 1 ? m.board_section_delete_holds_one() : m.board_section_delete_holds_many({ count })
}

/** What happens to what it holds: moved to another section by default, or deleted with it. */
function ContentsChoice({ targets }: { targets: { id: number; name: string }[] }) {
  const [choice, setChoice] = useState<'move' | 'delete'>(targets.length > 0 ? 'move' : 'delete')
  return (
    <RadioGroup
      name="contents"
      value={choice}
      onValueChange={value => setChoice(value as 'move' | 'delete')}
      className="gap-2.5 text-left"
    >
      {targets.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <RadioGroupItem id="contents-move" value="move" />
            <Label htmlFor="contents-move" className="font-normal">
              {m.board_section_delete_move()}
            </Label>
          </div>
          {choice === 'move' && (
            <Select name="moveTo" defaultValue={String(targets[0].id)}>
              <SelectTrigger className="ml-6 w-[calc(100%-1.5rem)]" aria-label={m.board_section_delete_move()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targets.map(target => (
                  <SelectItem key={target.id} value={String(target.id)}>
                    {target.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
      <div className="flex items-start gap-2">
        <RadioGroupItem id="contents-delete" value="delete" className="mt-0.5" />
        <Label htmlFor="contents-delete" className="flex flex-col items-start gap-0.5 font-normal">
          {m.board_section_delete_drop()}
          <span className="text-muted-foreground text-xs">{m.board_section_delete_drop_help()}</span>
        </Label>
      </div>
    </RadioGroup>
  )
}
