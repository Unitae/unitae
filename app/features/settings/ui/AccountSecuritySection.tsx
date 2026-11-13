import { Callout, FormSection } from '@unitae/ui'
import { useState } from 'react'
import { useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { SettingRow } from '~/shared/ui/SettingRow'
import { ConfirmDialog } from './ConfirmDialog'

interface AccountSecuritySectionProps {
  account: { id: number; email: string; twoFactorEnabledAt: Date | string | null; invited: boolean }
  /** The viewer may act on this account (an administrator's needs an administrator). */
  allowed: boolean
  timeZone: string
}

type Pending = 'two-factor' | 'password' | null

/**
 * What helps someone who can no longer sign in: reset their two-step verification, send them a password link (or their
 * invitation again), and the download of their data. Each sensitive action asks first.
 */
export function AccountSecuritySection({ account, allowed, timeZone }: AccountSecuritySectionProps) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>()
  const [pending, setPending] = useState<Pending>(null)
  const since =
    account.twoFactorEnabledAt != null
      ? new Intl.DateTimeFormat(getLocale(), { dateStyle: 'long', timeZone }).format(
          new Date(account.twoFactorEnabledAt),
        )
      : null
  const refusal = fetcher.state === 'idle' && fetcher.data?.ok === false ? fetcher.data.error : null

  return (
    <FormSection title={m.settings_account_section_security()} description={m.settings_account_section_security_hint()}>
      <div className="col-span-full flex flex-col gap-2">
        {refusal && <Callout tone="danger" role="alert" title={refusal} />}
        <div className="overflow-hidden rounded-lg border bg-card">
          <SettingRow
            title={m.settings_account_2fa()}
            description={since ? m.settings_account_2fa_on({ date: since }) : m.settings_account_2fa_off()}
          >
            {since && allowed && (
              <Button type="button" variant="outline" size="sm" onClick={() => setPending('two-factor')}>
                {m.settings_account_2fa_reset()}
              </Button>
            )}
          </SettingRow>
          <SettingRow
            title={account.invited ? m.settings_account_invitation() : m.settings_account_password()}
            description={
              account.invited ? m.settings_account_invitation_description() : m.settings_account_password_description()
            }
          >
            {allowed && (
              <Button type="button" variant="outline" size="sm" onClick={() => setPending('password')}>
                {account.invited ? m.settings_account_invitation_resend() : m.settings_account_password_send()}
              </Button>
            )}
          </SettingRow>
          <SettingRow title={m.settings_account_data()} description={m.settings_account_data_description()}>
            <Button asChild variant="outline" size="sm">
              <a href={`/settings/users/${account.id}/export-data`} download>
                {m.settings_account_data_download()}
              </a>
            </Button>
          </SettingRow>
        </div>
      </div>

      <ConfirmDialog
        open={pending === 'two-factor'}
        onOpenChange={open => !open && setPending(null)}
        title={m.settings_user_2fa_reset_confirm_title()}
        description={m.settings_account_2fa_reset_description()}
        confirmLabel={m.settings_account_2fa_reset_confirm()}
        destructive
        onConfirm={() => fetcher.submit(null, { method: 'post', action: `/settings/users/${account.id}/reset-2fa` })}
      />
      <ConfirmDialog
        open={pending === 'password'}
        onOpenChange={open => !open && setPending(null)}
        title={account.invited ? m.settings_account_invitation_title() : m.settings_account_password_title()}
        description={
          account.invited
            ? m.settings_account_invitation_confirm_description({ email: account.email })
            : m.settings_account_password_confirm_description({ email: account.email })
        }
        confirmLabel={account.invited ? m.settings_account_invitation_confirm() : m.settings_account_password_confirm()}
        onConfirm={() => fetcher.submit(null, { method: 'post', action: `/password/${account.id}/invalidate` })}
      />
    </FormSection>
  )
}
