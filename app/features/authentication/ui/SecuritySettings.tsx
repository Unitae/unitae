import { Panel, Status } from '@unitae/ui'
import { KeyRound, LogOut, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { SettingRow } from '~/shared/ui/SettingRow'
import { PasswordDialog } from './PasswordDialog'
import { DisableTwoFactorDialog, EnableTwoFactorDialog } from './TwoFactorDialogs'

type Open = 'password' | 'enable' | 'disable' | 'devices' | null

interface SecuritySettingsProps {
  /** When two-step verification was turned on, or null while it is off. */
  twoFactorSince: string | Date | null
  timezone: string
}

/** « Sécurité »: the password, two-step verification, and signing out the other devices, each in its dialog. */
export function SecuritySettings({ twoFactorSince, timezone }: SecuritySettingsProps) {
  const [open, setOpen] = useState<Open>(null)
  const close = (isOpen: boolean) => !isOpen && setOpen(null)
  const since =
    twoFactorSince &&
    new Intl.DateTimeFormat(getLocale(), { dateStyle: 'long', timeZone: timezone }).format(new Date(twoFactorSince))

  return (
    <>
      <Panel aria-label={m.account_section_security()}>
        <SettingRow icon={KeyRound} title={m.account_password_title()} description={m.account_password_description()}>
          <Button type="button" variant="outline" onClick={() => setOpen('password')}>
            {m.account_password_change()}
          </Button>
        </SettingRow>
        <SettingRow
          icon={Smartphone}
          title={m.account_2fa_title()}
          status={
            since ? (
              <Status tone="success" className="font-normal">
                {m.account_2fa_on({ date: since })}
              </Status>
            ) : (
              <Status tone="neutral" className="font-normal">
                {m.account_2fa_off()}
              </Status>
            )
          }
          description={m.account_2fa_description()}
        >
          {since ? (
            <Button type="button" variant="outline" onClick={() => setOpen('disable')}>
              {m.account_2fa_disable()}
            </Button>
          ) : (
            <Button type="button" onClick={() => setOpen('enable')}>
              {m.account_2fa_enable()}
            </Button>
          )}
        </SettingRow>
        <SettingRow icon={LogOut} title={m.account_devices_title()} description={m.account_devices_description()}>
          <Button type="button" variant="outline" onClick={() => setOpen('devices')}>
            {m.account_devices_button()}
          </Button>
        </SettingRow>
      </Panel>
      <p className="text-faint text-sm leading-relaxed">{m.account_2fa_lost()}</p>

      <PasswordDialog open={open === 'password'} onOpenChange={close} />
      <EnableTwoFactorDialog open={open === 'enable'} onOpenChange={close} />
      <DisableTwoFactorDialog open={open === 'disable'} onOpenChange={close} />
      <SignOutOthersDialog open={open === 'devices'} onOpenChange={close} />
    </>
  )
}

function SignOutOthersDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>()
  useCloseOnSave(fetcher, () => onOpenChange(false))
  const error = fetcher.data?.ok === false ? fetcher.data.error : undefined

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <fetcher.Form method="post" action="/me/security" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="sign-out-others" />
          <AlertDialogHeader>
            <AlertDialogTitle>{m.account_devices_dialog_title()}</AlertDialogTitle>
            <AlertDialogDescription>{m.account_devices_dialog_body()}</AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{m.common_cancel()}</AlertDialogCancel>
            <Button type="submit" disabled={fetcher.state !== 'idle'}>
              {m.account_devices_confirm()}
            </Button>
          </AlertDialogFooter>
        </fetcher.Form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
