import { getFormProps, getInputProps, type SubmissionResult, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { Callout } from '@unitae/ui'
import { useFetcher } from 'react-router'
import { createUserSchema } from '~/features/settings/schemas/user.schema'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { Input } from '~/shared/ui/input'
import { SettingsField } from './SettingsField'

interface NewUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Creates an account and sends its invitation: the name and the address only. Its roles are given on its page, which
 * opens once it is created.
 */
export function NewUserDialog({ open, onOpenChange }: NewUserDialogProps) {
  const fetcher = useFetcher<SubmissionResult<string[]>>()
  const [form, fields] = useForm({
    lastResult: fetcher.state === 'idle' ? fetcher.data : undefined,
    shouldValidate: 'onBlur',
    onValidate: ({ formData }) => parseWithZod(formData, { schema: createUserSchema }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.settings_users_new_title()}</DialogTitle>
          <DialogDescription>{m.settings_users_new_description()}</DialogDescription>
        </DialogHeader>
        <fetcher.Form
          method="post"
          action="/settings/users/new"
          {...getFormProps(form)}
          className="flex flex-col gap-4"
        >
          {form.errors && <Callout tone="danger" role="alert" title={form.errors.join(' ')} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsField
              id={fields.firstname.id}
              label={m.settings_user_edit_firstname_label()}
              error={fields.firstname.errors?.[0]}
            >
              <Input {...getInputProps(fields.firstname, { type: 'text' })} autoComplete="off" />
            </SettingsField>
            <SettingsField
              id={fields.lastname.id}
              label={m.settings_user_edit_lastname_label()}
              error={fields.lastname.errors?.[0]}
            >
              <Input {...getInputProps(fields.lastname, { type: 'text' })} autoComplete="off" />
            </SettingsField>
          </div>
          <SettingsField id={fields.email.id} label={m.settings_account_email()} error={fields.email.errors?.[0]}>
            <Input {...getInputProps(fields.email, { type: 'email' })} autoComplete="off" />
          </SettingsField>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {m.common_cancel()}
            </Button>
            <Button type="submit" disabled={fetcher.state !== 'idle'}>
              {m.settings_users_new_submit()}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  )
}
