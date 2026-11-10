import { Avatar, FactList, Panel, SectionHeading } from '@unitae/ui'
import type { AccountProfile } from '~/features/authentication/model/account-profile.type'
import * as m from '~/i18n/paraglide/messages'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'

function recordLine(profile: AccountProfile, congregation: string): string {
  if (profile.record === 'publisher') return m.account_profile_publisher_of({ congregation })
  if (profile.record === 'not-publisher') return m.account_profile_not_publisher({ congregation })
  return m.account_profile_no_record()
}

/** Whom to tell about a mistake: the group's overseer by name, else an elder, else (no record) an administrator. */
function reportLine(profile: AccountProfile): string {
  if (profile.record === 'none') return m.account_profile_report_admin()
  const overseer = profile.group?.overseer
  return overseer
    ? m.account_profile_report_overseer({ name: formatPersonName(overseer) })
    : m.account_profile_report_elder()
}

/** « Votre fiche »: what the congregation holds about the person, read-only, and who can correct it. */
export function ProfileRecord({ profile, congregation }: { profile: AccountProfile; congregation: string }) {
  const name = formatPersonName(profile, profile.email)

  return (
    <section aria-labelledby="account-record">
      <SectionHeading id="account-record" title={m.account_profile_record_title()} />
      <Panel>
        <div className="flex items-center gap-3 border-b px-4.5 py-4">
          <Avatar name={name} className="size-10 text-sm" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-semibold">{name}</span>
            <span className="text-faint text-sm">{recordLine(profile, congregation)}</span>
          </div>
        </div>
        <div className="px-4.5 py-4">
          <FactList
            facts={[
              { label: m.account_profile_email(), value: profile.email },
              { label: m.account_profile_group(), value: profile.group && formatGroupName(profile.group.name) },
            ]}
          />
        </div>
        <p className="border-t px-4.5 py-3 text-faint text-sm leading-relaxed">{reportLine(profile)}</p>
      </Panel>
    </section>
  )
}
