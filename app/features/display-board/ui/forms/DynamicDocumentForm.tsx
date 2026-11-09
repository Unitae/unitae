import { getFormProps, getInputProps, type SubmissionResult, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { FormSection } from '@unitae/ui'
import { useEffect, useState } from 'react'
import { Form, Link } from 'react-router'
import type { BoardAppearance } from '~/features/display-board/model/board-appearance'
import type { DisplayWindowInput } from '~/features/display-board/model/display-window'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import { dynamicDocumentSchema } from '~/features/display-board/schemas/board-document.schema'
import type { getDynamicDocumentData } from '~/features/display-board/server/dynamic-documents.server'
import { AppearanceFields } from '~/features/display-board/ui/dynamic/AppearanceFields'
import { ProgrammeConfigFields } from '~/features/display-board/ui/dynamic/ProgrammeConfigFields'
import { AppearancePreview } from '~/features/display-board/ui/forms/AppearancePreview'
import { DisplayFields } from '~/features/display-board/ui/forms/DisplayFields'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { FormSaveBar } from '~/shared/ui/FormSaveBar'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

type DocumentData = NonNullable<Awaited<ReturnType<typeof getDynamicDocumentData>>>

export interface DynamicFormDefaults {
  title: string
  sectionId: number
  window: DisplayWindowInput
  highlighted: boolean
  dynamicConfig: unknown
}

interface DynamicDocumentFormProps {
  /** Its id; null on a new document, whose type and ref the form then carries. */
  id: number | null
  type: DynamicType
  dynamicRef: string | null
  defaults: DynamicFormDefaults
  appearance: BoardAppearance
  sections: { id: number; name: string }[]
  templates: { id: number; name: string }[]
  highlightedOthers: number
  data: DocumentData | null
  congregationName: string
  lastResult: SubmissionResult<string[]> | null | undefined
  onCancel?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * A dynamic document's form, new or edited: its title and section, when it shows, a programme's content,
 * and its appearance. Beside it, the document with today's data in the appearance being chosen.
 */
export function DynamicDocumentForm({
  id,
  type,
  dynamicRef,
  defaults,
  appearance: savedAppearance,
  sections,
  templates,
  highlightedOthers,
  data,
  congregationName,
  lastResult,
  onCancel,
  onDirtyChange,
}: DynamicDocumentFormProps) {
  const isNew = id == null
  const { ref, changes } = useFormChanges()
  useEffect(() => onDirtyChange?.(changes > 0), [changes, onDirtyChange])
  useFocusError(lastResult)
  const [form, fields] = useForm({
    lastResult,
    defaultValue: { title: defaults.title, sectionId: String(defaults.sectionId) },
    onValidate: ({ formData }) => parseWithZod(formData, { schema: dynamicDocumentSchema }),
    shouldValidate: 'onBlur',
    shouldRevalidate: 'onInput',
  })
  const [title, setTitle] = useState(defaults.title)
  const [appearance, setAppearance] = useState(savedAppearance)

  return (
    // The preview sticks to the top as the form scrolls: the shell needs to know.
    <div className="flex items-start gap-10" data-sticky-content="">
      <Form method="post" {...getFormProps(form)} ref={ref} className="flex min-w-0 flex-1 flex-col pb-24">
        <FormSection title={m.board_form_document_title()} description={m.board_form_document_description()}>
          <div className="col-span-full flex flex-col gap-2">
            <Label htmlFor={fields.title.id}>{m.board_form_title_label()}</Label>
            <Input
              {...getInputProps(fields.title, { type: 'text' })}
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
        <DisplayFields
          defaults={defaults.window}
          highlighted={defaults.highlighted}
          highlightedOthers={highlightedOthers}
          errors={{ from: fields.from.errors, until: fields.until.errors }}
        />
        {type === DynamicType.Programme && templates.length > 0 && (
          <FormSection title={m.board_form_content_title()} description={m.board_form_content_description()}>
            <ProgrammeConfigFields templates={templates} storedConfig={defaults.dynamicConfig} onChange={() => {}} />
          </FormSection>
        )}
        <FormSection title={m.board_appearance_title()} description={m.board_form_appearance_description()}>
          <AppearanceFields dynamicType={type} value={appearance} onChange={setAppearance} />
        </FormSection>

        {/* After the sections: the first of them draws no rule above it. */}
        {isNew && (
          <>
            <input type="hidden" name="dynamicType" value={type} />
            <input type="hidden" name="dynamicRef" value={dynamicRef ?? ''} />
          </>
        )}
        {(isNew || changes > 0) && (
          <FormSaveBar changes={isNew ? null : changes}>
            {isNew ? (
              <Button variant="ghost" asChild>
                <Link to="/board/documents/new-dynamic">{m.common_cancel()}</Link>
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={onCancel}>
                {m.common_cancel()}
              </Button>
            )}
            <SubmitButton>{isNew ? m.board_form_add_submit() : m.common_save()}</SubmitButton>
          </FormSaveBar>
        )}
      </Form>
      <div className="sticky top-6 w-[440px] shrink-0 max-xl:hidden">
        <AppearancePreview
          data={data}
          appearance={appearance}
          title={title}
          congregationName={congregationName}
          pdfUrl={id == null ? null : `/board/dynamic/${id}/pdf`}
        />
      </div>
    </div>
  )
}
