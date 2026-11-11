import { type ComponentProps, type ReactNode, useEffect, useState } from 'react'
import { Form } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { FormSaveBar } from '~/shared/ui/FormSaveBar'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { cn } from '~/shared/utils/utils'

type CountChanges = (before: FormData, after: FormData) => number

interface SettingsFormProps extends Omit<ComponentProps<typeof Form>, 'ref' | 'children'> {
  /** How the changes are counted; module level, never an inline closure. Defaults to one per changed field. */
  count?: CountChanges
  /** Refusals of the whole form, above its sections. */
  errors?: string[]
  /** What is saved, e.g. the loader's values as JSON: when it changes (a save), the form starts again from it. */
  savedKey: string
  children: ReactNode
}

/**
 * A settings page's form: its sections, then the save bar, which shows as soon as something differs from what is
 * saved and counts the changes. « Annuler » puts back what is saved; leaving with changes asks first.
 */
export function SettingsForm(props: SettingsFormProps) {
  // « Annuler » remounts the form, so every field shows what is saved again.
  const [version, setVersion] = useState(0)
  return (
    <SettingsFormBody key={`${props.savedKey}:${version}`} {...props} onCancel={() => setVersion(value => value + 1)} />
  )
}

function SettingsFormBody({
  count,
  errors,
  savedKey: _savedKey,
  children,
  className,
  onCancel,
  ...formProps
}: SettingsFormProps & { onCancel: () => void }) {
  const { ref, changes } = useFormChanges(count)
  const { blocker, setDirty } = useUnsavedChanges()
  useEffect(() => setDirty(changes > 0), [changes, setDirty])

  return (
    <Form method="post" {...formProps} ref={ref} className={cn('flex flex-col pb-24', className)}>
      <UnsavedChangesDialog blocker={blocker} />
      {errors && errors.length > 0 && (
        <p role="alert" className="mb-2 rounded-md bg-destructive/10 px-3.5 py-2.5 text-destructive text-sm">
          {errors.join(' ')}
        </p>
      )}
      {children}
      {changes > 0 && (
        <FormSaveBar changes={changes}>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {m.common_cancel()}
          </Button>
          <SubmitButton>{m.common_save()}</SubmitButton>
        </FormSaveBar>
      )}
    </Form>
  )
}
