import { Panel, SectionHeading, StatusIcon } from '@unitae/ui'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { Form, Link } from 'react-router'
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
import { SettingRow } from '~/shared/ui/SettingRow'
import { SubmitButton } from '~/shared/ui/SubmitButton'

const PURPOSE_LABELS: Record<string, () => string> = {
  DATA_PROCESSING: () => m.consent_purpose_data_processing(),
}

export interface ConsentView {
  id: number
  purpose: string
  consentedAt: string | Date
  consentVersion: string
}

/** « Confidentialité »: the consents in force (withdrawing asks first), the data download and how to have it erased. */
export function PrivacySettings({ consents, timezone }: { consents: ConsentView[]; timezone: string }) {
  const [withdrawing, setWithdrawing] = useState<ConsentView | null>(null)
  const day = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'long', timeZone: timezone })

  return (
    <>
      <section aria-labelledby="account-consents">
        <SectionHeading id="account-consents" title={m.account_consent_title()} />
        <Panel>
          {consents.length === 0 ? (
            <p className="px-4.5 py-3.5 text-muted-foreground text-sm">{m.account_consent_none()}</p>
          ) : (
            consents.map(consent => (
              <SettingRow
                key={consent.id}
                title={
                  <span className="inline-flex items-center gap-2">
                    <StatusIcon tone="success" />
                    {PURPOSE_LABELS[consent.purpose]?.() ?? consent.purpose}
                  </span>
                }
                description={
                  <span className="tabular-nums">
                    {m.account_consent_given({
                      date: day.format(new Date(consent.consentedAt)),
                      version: consent.consentVersion,
                    })}
                  </span>
                }
              >
                <Button type="button" variant="outline" onClick={() => setWithdrawing(consent)}>
                  {m.account_consent_withdraw()}
                </Button>
              </SettingRow>
            ))
          )}
        </Panel>
      </section>

      <section aria-labelledby="account-data">
        <SectionHeading id="account-data" title={m.account_data_title()} />
        <Panel>
          <SettingRow title={m.account_export_title()} description={m.account_export_description()}>
            <Button asChild={true} variant="outline">
              <a href="/me/export-data" download={true}>
                <Download aria-hidden="true" />
                {m.account_export_button()}
              </a>
            </Button>
          </SettingRow>
          <SettingRow title={m.account_erasure_title()} description={m.account_erasure_description()} />
        </Panel>
      </section>

      <Link to="/privacy" className="w-fit text-brand-text text-sm underline-offset-4 hover:underline">
        {m.account_privacy_policy()}
      </Link>

      <WithdrawConsentDialog consent={withdrawing} onOpenChange={open => !open && setWithdrawing(null)} />
    </>
  )
}

/**
 * Says what withdrawing does before it happens: the app can no longer be used, the next page asks to accept again
 * or sign out, and the data stays until an administrator erases it.
 */
function WithdrawConsentDialog({
  consent,
  onOpenChange,
}: {
  consent: ConsentView | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <AlertDialog open={consent != null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {consent && (
          // A navigation, not a fetcher: the answer is the consent page, where the person accepts again or leaves.
          <Form method="post" action="/me/privacy" className="flex flex-col gap-4">
            <input type="hidden" name="purpose" value={consent.purpose} />
            <AlertDialogHeader>
              <AlertDialogTitle>{m.account_consent_dialog_title()}</AlertDialogTitle>
              <AlertDialogDescription>{m.account_consent_dialog_body()}</AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground text-sm leading-relaxed">
              <li>{m.account_consent_dialog_again()}</li>
              <li>{m.account_consent_dialog_data()}</li>
            </ul>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">{m.account_consent_dialog_keep()}</AlertDialogCancel>
              <SubmitButton variant="destructive">{m.account_consent_dialog_confirm()}</SubmitButton>
            </AlertDialogFooter>
          </Form>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
