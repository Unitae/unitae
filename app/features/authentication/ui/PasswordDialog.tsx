import { getFormProps, getInputProps, type SubmissionResult, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { useFetcher } from 'react-router'
import { changePasswordSchema } from '~/features/authentication/schemas/login.schema'
import * as m from '~/i18n/paraglide/messages'
import { AuthField } from '~/shared/ui/auth-parts'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { PasswordInput } from '~/shared/ui/PasswordInput'

/** What the security action answers to `intent=password`: saved, or the form with its refusals. */
export type PasswordResult = { ok: true } | { ok: false; reply: SubmissionResult<string[]> }

/**
 * Changing the password: the current one, then the new one typed twice, each with « Afficher ». The refusals land
 * under their field and the dialog keeps what was typed; once saved, it closes and the toast says the other devices
 * were signed out.
 */
export function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.account_password_dialog_title()}</DialogTitle>
          <DialogDescription>{m.account_password_dialog_note()}</DialogDescription>
        </DialogHeader>
        {/* Inside the content: a fresh form, with no refusal left over, each time the dialog opens. */}
        <PasswordForm onSaved={() => onOpenChange(false)} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function PasswordForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const fetcher = useFetcher<PasswordResult>()
  useCloseOnSave(fetcher, onSaved)
  const reply = fetcher.data?.ok === false ? fetcher.data.reply : undefined

  const [form, fields] = useForm({
    lastResult: reply,
    shouldValidate: 'onBlur',
    shouldRevalidate: 'onInput',
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: changePasswordSchema })
    },
  })

  const field = (
    meta: typeof fields.password,
    label: string,
    autoComplete: 'current-password' | 'new-password',
    help?: string,
  ) => (
    <AuthField id={meta.id} label={label} errorId={meta.errorId} errors={meta.errors} help={help}>
      <PasswordInput {...getInputProps(meta, { type: 'password' })} key={meta.key} autoComplete={autoComplete} />
    </AuthField>
  )

  return (
    <fetcher.Form method="post" action="/me/security" className="flex flex-col gap-4" {...getFormProps(form)}>
      <input type="hidden" name="intent" value="password" />
      {field(fields.password, m.account_password_current(), 'current-password')}
      {field(fields.new_password, m.account_password_new(), 'new-password', m.auth_password_help())}
      {field(fields.new_password_confirm, m.account_password_confirm(), 'new-password')}
      <DialogFooter className="pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {m.common_cancel()}
        </Button>
        <Button type="submit" disabled={fetcher.state !== 'idle'}>
          {m.account_password_save()}
        </Button>
      </DialogFooter>
    </fetcher.Form>
  )
}
