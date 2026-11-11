import { type FieldMetadata, getInputProps } from '@conform-to/react'
import { FormSection } from '@unitae/ui'
import { Link } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { SettingRow } from '~/shared/ui/SettingRow'
import { Switch } from '~/shared/ui/switch'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { SettingsField } from './SettingsField'

interface AccountLoginSectionProps {
  account: {
    firstname: string | null
    lastname: string | null
    email: string
    active: boolean
    memberId: number | null
  }
  fields: {
    firstname: FieldMetadata<string | undefined>
    lastname: FieldMetadata<string | undefined>
    email: FieldMetadata<string>
  }
  isSelf: boolean
  editable: boolean
  /** Where the record's name is corrected, when the viewer may. */
  recordEditHref: string | null
}

/** The account's name (its record's, when it has one), its sign-in address, and whether it can sign in. */
export function AccountLoginSection({ account, fields, isSelf, editable, recordEditHref }: AccountLoginSectionProps) {
  const linked = account.memberId != null
  return (
    <FormSection
      title={m.settings_account_section_login()}
      description={linked ? m.settings_account_section_login_hint_linked() : m.settings_account_section_login_hint()}
    >
      {linked ? (
        <div className="col-span-full flex flex-col gap-1">
          <span className="font-medium text-sm">{m.settings_account_name()}</span>
          <span className="flex flex-wrap items-baseline gap-x-3 text-sm">
            {formatPersonName(account)}
            {recordEditHref && (
              <Link to={recordEditHref} className="font-medium text-brand-text text-sm hover:underline">
                {m.settings_account_correct_on_record()}
              </Link>
            )}
          </span>
        </div>
      ) : (
        <>
          <SettingsField
            id={fields.firstname.id}
            label={m.settings_user_edit_firstname_label()}
            error={fields.firstname.errors?.[0]}
          >
            <Input
              {...getInputProps(fields.firstname, { type: 'text' })}
              key={fields.firstname.id}
              defaultValue={account.firstname ?? ''}
              disabled={!editable}
            />
          </SettingsField>
          <SettingsField
            id={fields.lastname.id}
            label={m.settings_user_edit_lastname_label()}
            error={fields.lastname.errors?.[0]}
          >
            <Input
              {...getInputProps(fields.lastname, { type: 'text' })}
              key={fields.lastname.id}
              defaultValue={account.lastname ?? ''}
              disabled={!editable}
            />
          </SettingsField>
        </>
      )}
      <SettingsField
        id={fields.email.id}
        label={m.settings_account_email()}
        hint={linked ? m.settings_account_email_hint_linked() : undefined}
        error={fields.email.errors?.[0]}
        className="col-span-full"
      >
        <Input
          {...getInputProps(fields.email, { type: 'email' })}
          key={fields.email.id}
          defaultValue={account.email}
          disabled={!editable}
        />
      </SettingsField>
      <div className="col-span-full overflow-hidden rounded-lg border bg-card">
        {/* Nobody switches their own account off: the switch stays on, and on it is saved. */}
        {isSelf && account.active && <input type="hidden" name="active" value="on" />}
        <SettingRow
          htmlFor="account-active"
          title={m.settings_account_active()}
          description={isSelf ? m.settings_account_own_active() : m.settings_account_active_description()}
        >
          <Switch
            id="account-active"
            name={isSelf ? undefined : 'active'}
            defaultChecked={account.active}
            disabled={!editable || isSelf}
          />
        </SettingRow>
      </div>
    </FormSection>
  )
}
