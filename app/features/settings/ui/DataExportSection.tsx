import { FormSection } from '@unitae/ui'
import { Download } from 'lucide-react'
import { Form } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { SettingRow } from '~/shared/ui/SettingRow'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Switch } from '~/shared/ui/switch'
import { type TransferJob, TransferProgress } from './TransferProgress'

interface DataExportSectionProps {
  /** The export just started, while it runs or once it ended. */
  job: (TransferJob & { id: string }) | null
  history: { id: string; finishedOn: number | null }[]
  timeZone: string
}

/** An archive of all the congregation's data: what goes in it, its progress, then the archives made before. */
export function DataExportSection({ job, history, timeZone }: DataExportSectionProps) {
  const format = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short', timeZone })
  return (
    <FormSection title={m.settings_data_export()} description={m.settings_data_export_hint()}>
      <div className="col-span-full flex flex-col gap-4">
        {job ? (
          <TransferProgress kind="export" job={job} downloadHref={`/settings/data/export/${job.id}/download`} />
        ) : (
          <Form method="post" className="flex flex-col gap-3">
            <input type="hidden" name="intent" value="export" />
            <div className="overflow-hidden rounded-lg border bg-card">
              <SettingRow
                htmlFor="includeFiles"
                title={m.export_include_files()}
                description={m.export_include_files_hint()}
              >
                <Switch id="includeFiles" name="includeFiles" />
              </SettingRow>
              <SettingRow
                htmlFor="includeAuditLogs"
                title={m.export_include_audit_logs()}
                description={m.export_include_audit_logs_hint()}
              >
                <Switch id="includeAuditLogs" name="includeAuditLogs" />
              </SettingRow>
            </div>
            <SubmitButton className="self-start">{m.export_submit()}</SubmitButton>
          </Form>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-sm">{m.export_history_title()}</span>
          {history.length === 0 ? (
            <p className="text-faint text-sm">{m.export_history_empty()}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card">
              {history.map(archive => (
                <div key={archive.id} className="flex items-center gap-3 border-t px-4 py-2 first:border-t-0">
                  <span className="flex-1 text-sm tabular-nums">
                    {archive.finishedOn ? format.format(new Date(archive.finishedOn)) : '—'}
                  </span>
                  <Button asChild variant="ghost" size="sm">
                    <a href={`/settings/data/export/${archive.id}/download`}>
                      <Download aria-hidden="true" />
                      {m.export_history_download()}
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </FormSection>
  )
}
