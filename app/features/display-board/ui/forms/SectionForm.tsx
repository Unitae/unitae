import { getFormProps, getInputProps, type SubmissionResult, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { FormSection, SegmentedControl } from '@unitae/ui'
import { useEffect, useState } from 'react'
import { Form, Link } from 'react-router'
import { sectionAudience } from '~/features/display-board/model/section-audience'
import { sectionSchema } from '~/features/display-board/schemas/board-section.schema'
import * as m from '~/i18n/paraglide/messages'
import type { RoleOption } from '~/shared/types/role'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Button } from '~/shared/ui/button'
import { FormSaveBar } from '~/shared/ui/FormSaveBar'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { RoleChips } from '~/shared/ui/RoleChips'
import { SubmitButton } from '~/shared/ui/SubmitButton'

type Visibility = 'everyone' | 'roles'

interface SectionFormProps {
  /** Null on a new section. */
  defaults: { name: string; roleIds: number[] } | null
  roles: RoleOption[]
  /** The roles of each person who can open the board, to count who would see it. */
  readerRoles: number[][]
  /** This person's roles: a choice that leaves them out is pointed out. */
  viewerRoleIds: number[]
  lastResult: SubmissionResult<string[]> | null | undefined
  onCancel?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

function audienceText(count: number) {
  if (count === 0) return m.board_section_form_audience_none()
  return m.board_section_form_audience({ count })
}

/**
 * A section's form: its name, and who sees it, everyone or the holders of chosen roles, with how many
 * people that is, counted as the board counts them.
 */
export function SectionForm({
  defaults,
  roles,
  readerRoles,
  viewerRoleIds,
  lastResult,
  onCancel,
  onDirtyChange,
}: SectionFormProps) {
  const isNew = defaults == null
  const { ref, changes } = useFormChanges()
  useEffect(() => onDirtyChange?.(changes > 0), [changes, onDirtyChange])
  useFocusError(lastResult)
  const [form, fields] = useForm({
    lastResult,
    defaultValue: { name: defaults?.name ?? '' },
    onValidate: ({ formData }) => parseWithZod(formData, { schema: sectionSchema }),
    shouldValidate: 'onBlur',
    shouldRevalidate: 'onInput',
  })
  const [visibility, setVisibility] = useState<Visibility>(defaults?.roleIds.length ? 'roles' : 'everyone')
  const [roleIds, setRoleIds] = useState(defaults?.roleIds ?? [])
  const chosen = visibility === 'roles' ? roleIds : []
  const audience = sectionAudience(
    readerRoles.map(ids => ({ roleIds: ids })),
    chosen,
  ).length
  const leavesMeOut = chosen.length > 0 && chosen.every(id => !viewerRoleIds.includes(id))
  const roleErrors = fields.visibilityRoleIds.errors

  return (
    <Form method="post" {...getFormProps(form)} ref={ref} className="flex max-w-4xl flex-col pb-24">
      <FormSection title={m.board_section_form_title()} description={m.board_section_form_description()}>
        <div className="col-span-full flex flex-col gap-2">
          <Label htmlFor={fields.name.id}>{m.board_section_form_name_label()}</Label>
          <Input {...getInputProps(fields.name, { type: 'text' })} autoComplete="off" />
          {fields.name.errors && <p className="text-destructive text-sm">{fields.name.errors[0]}</p>}
        </div>
      </FormSection>
      <FormSection
        title={m.board_section_form_visibility_title()}
        description={m.board_section_form_visibility_description()}
      >
        <div className="col-span-full flex flex-col items-start gap-2">
          <span className="font-medium text-sm">{m.board_section_form_visible_to()}</span>
          <input type="hidden" name="visibility" value={visibility} />
          <SegmentedControl
            options={[
              { value: 'everyone' as const, label: m.board_section_form_everyone() },
              { value: 'roles' as const, label: m.board_section_form_some_roles() },
            ]}
            value={visibility}
            onValueChange={setVisibility}
            aria-label={m.board_section_form_visible_to()}
          />
        </div>
        {visibility === 'roles' && (
          <div className="col-span-full flex flex-col gap-2">
            <span id="section-roles-label" className="font-medium text-sm">
              {m.board_section_form_roles_label()}
            </span>
            <RoleChips
              roles={roles}
              selectedIds={roleIds}
              onChange={setRoleIds}
              name="visibilityRoleIds"
              defaultLabel={m.board_section_form_no_role()}
              labelledBy="section-roles-label"
            />
            {roleErrors && <p className="text-destructive text-sm">{roleErrors[0]}</p>}
          </div>
        )}
        <p className="col-span-full text-muted-foreground text-sm" aria-live="polite">
          {audienceText(audience)}
        </p>
        {leavesMeOut && (
          <Alert className="col-span-full">
            <AlertDescription>{m.board_sections_visibility_self_lockout_warning()}</AlertDescription>
          </Alert>
        )}
      </FormSection>

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
          <SubmitButton>{isNew ? m.board_section_form_create() : m.common_save()}</SubmitButton>
        </FormSaveBar>
      )}
    </Form>
  )
}
