import { getFormProps, getInputProps, type SubmissionResult, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { FormSection } from '@unitae/ui'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Form, Link } from 'react-router'
import type { DisplayWindowInput } from '~/features/display-board/model/display-window'
import { titleFromFileName } from '~/features/display-board/model/file-title'
import { pdfDocumentSchema } from '~/features/display-board/schemas/board-document.schema'
import type { PdfBoardCard } from '~/features/display-board/server/board-home.queries'
import { BoardPreviewAside, type PreviewFacts } from '~/features/display-board/ui/forms/BoardPreviewAside'
import { DisplayFields } from '~/features/display-board/ui/forms/DisplayFields'
import { type CurrentFile, PdfFileField } from '~/features/display-board/ui/forms/PdfFileField'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { FormSaveBar } from '~/shared/ui/FormSaveBar'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { endOfDay } from '~/shared/utils/calendar-day'

export interface PdfFormDefaults {
  title: string
  sectionId: number | null
  window: DisplayWindowInput
  highlighted: boolean
}

interface PdfDocumentFormProps {
  /** The file it shows now; null on a new document. */
  current: CurrentFile | null
  defaults: PdfFormDefaults
  sections: { id: number; name: string }[]
  /** Only a reviewer chooses when it shows and puts it « à la une ». */
  canReview: boolean
  highlightedOthers: number
  card: PdfBoardCard
  facts?: PreviewFacts
  lastResult: SubmissionResult<string[]> | null | undefined
  timeZone: string
  /** In place of the card beside the form: the history. */
  panel?: ReactNode
  /** « Annuler » on an edit: start again from what was loaded. */
  onCancel?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

function UploaderNote({ isNew }: { isNew: boolean }) {
  return (
    <FormSection title={m.board_form_display_title()} description={m.board_form_display_description()}>
      <p className="col-span-full text-muted-foreground text-sm">
        {isNew ? m.board_form_uploader_note_new() : m.board_form_uploader_note_edit()}
      </p>
    </FormSection>
  )
}

/**
 * A PDF's form, new or edited: its file, its title and section, and for a reviewer when it shows. Beside
 * it, its card as the board will show it.
 */
export function PdfDocumentForm({
  current,
  defaults,
  sections,
  canReview,
  highlightedOthers,
  card,
  facts,
  lastResult,
  timeZone,
  panel,
  onCancel,
  onDirtyChange,
}: PdfDocumentFormProps) {
  const isNew = current == null
  const { ref, changes } = useFormChanges()
  useEffect(() => onDirtyChange?.(changes > 0), [changes, onDirtyChange])
  useFocusError(lastResult)
  const [form, fields] = useForm({
    lastResult,
    defaultValue: { title: defaults.title, sectionId: defaults.sectionId == null ? '' : String(defaults.sectionId) },
    onValidate: ({ formData }) => parseWithZod(formData, { schema: pdfDocumentSchema }),
    shouldValidate: 'onBlur',
    shouldRevalidate: 'onInput',
  })

  const titleInput = useRef<HTMLInputElement>(null)
  const prefilled = useRef('')
  const [title, setTitle] = useState(defaults.title)
  const [until, setUntil] = useState(defaults.window.until)

  // A new document takes its title from the file, until the person types one of their own.
  const fillTitle = (file: File | null) => {
    const input = titleInput.current
    if (file == null || input == null || (input.value !== '' && input.value !== prefilled.current)) return
    const next = titleFromFileName(file.name)
    input.value = next
    input.dispatchEvent(new Event('input', { bubbles: true }))
    prefilled.current = next
    setTitle(next)
  }

  const preview: PdfBoardCard = {
    ...card,
    title: title.trim() || m.board_form_untitled(),
    visibleUntil: until === '' ? null : endOfDay(until, timeZone),
  }
  const fileErrors = lastResult?.error?.document ?? undefined
  const fileField = (
    <PdfFileField current={current} errors={fileErrors} timeZone={timeZone} onFile={isNew ? fillTitle : undefined} />
  )

  return (
    // The history panel sticks to the top as the form scrolls: the shell needs to know.
    <div className="flex items-start gap-10" data-sticky-content={panel ? '' : undefined}>
      <Form
        method="post"
        encType="multipart/form-data"
        {...getFormProps(form)}
        ref={ref}
        className="flex min-w-0 flex-1 flex-col pb-24"
      >
        {isNew && fileField}
        <FormSection title={m.board_form_document_title()} description={m.board_form_document_description()}>
          <div className="col-span-full flex flex-col gap-2">
            <Label htmlFor={fields.title.id}>{m.board_form_title_label()}</Label>
            <Input
              {...getInputProps(fields.title, { type: 'text' })}
              ref={titleInput}
              autoComplete="off"
              onInput={event => setTitle(event.currentTarget.value)}
            />
            {fields.title.errors && <p className="text-destructive text-sm">{fields.title.errors[0]}</p>}
          </div>
          <div className="col-span-full flex flex-col gap-2">
            <Label htmlFor={fields.sectionId.id}>{m.board_form_section_label()}</Label>
            <Select name={fields.sectionId.name} defaultValue={fields.sectionId.initialValue as string | undefined}>
              <SelectTrigger id={fields.sectionId.id} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sections.map(section => (
                  <SelectItem key={section.id} value={String(section.id)}>
                    {section.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FormSection>
        {!isNew && fileField}
        {canReview ? (
          <DisplayFields
            defaults={defaults.window}
            highlighted={defaults.highlighted}
            highlightedOthers={highlightedOthers}
            errors={{ from: fields.from.errors, until: fields.until.errors }}
            onUntilChange={setUntil}
          />
        ) : (
          <UploaderNote isNew={isNew} />
        )}

        {(isNew || changes > 0) && (
          <FormSaveBar changes={isNew ? null : changes}>
            {isNew ? (
              <Button variant="ghost" asChild>
                <Link to="/board/documents">{m.common_cancel()}</Link>
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={onCancel}>
                {m.common_cancel()}
              </Button>
            )}
            <SubmitButton>{isNew ? m.board_form_upload_submit() : m.common_save()}</SubmitButton>
          </FormSaveBar>
        )}
      </Form>
      {panel ?? (
        <div className="w-[280px] shrink-0 max-lg:hidden">
          <BoardPreviewAside card={preview} timeZone={timeZone} facts={facts} />
        </div>
      )}
    </div>
  )
}
