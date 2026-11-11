import { FormSection, Status } from '@unitae/ui'
import { Upload } from 'lucide-react'
import { Form, Link } from 'react-router'
import type { ImportSummary } from '~/features/settings/server/data-transfer.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { entityLabel } from './data-entity-labels'
import { type TransferJob, TransferProgress } from './TransferProgress'

interface DataImportSectionProps {
  /** The import started, while it runs or once it ended. */
  job: TransferJob | null
  /** The archive read and waiting for its confirmation: what it holds. */
  pending: { archive: string; summary: ImportSummary } | null
  /** The archive asked for is gone (expired, or another congregation's). */
  expired: boolean
}

/** Reads an archive, shows what it holds, then imports it once confirmed. */
export function DataImportSection({ job, pending, expired }: DataImportSectionProps) {
  return (
    <FormSection title={m.settings_data_import()} description={m.settings_data_import_hint()}>
      <div className="col-span-full flex flex-col gap-4">
        {job ? (
          <TransferProgress kind="import" job={job} />
        ) : pending ? (
          <ImportSummaryView archive={pending.archive} summary={pending.summary} />
        ) : (
          <Form method="post" encType="multipart/form-data" className="flex flex-col gap-3">
            {expired && <p className="text-destructive text-sm">{m.settings_data_import_expired()}</p>}
            <div className="flex flex-col gap-2">
              <Label htmlFor="archive">{m.settings_data_file()}</Label>
              <Input id="archive" name="archive" type="file" accept=".unitae" required />
            </div>
            <SubmitButton variant="outline" className="self-start">
              <Upload aria-hidden="true" />
              {m.settings_data_check()}
            </SubmitButton>
          </Form>
        )}
      </div>
    </FormSection>
  )
}

function ImportSummaryView({ archive, summary }: { archive: string; summary: ImportSummary }) {
  const counts = Object.entries(summary.entityCounts).filter(([, count]) => count > 0)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-sm">{m.import_confirm_entity_counts()}</span>
        <div className="overflow-hidden rounded-lg border bg-card">
          {counts.map(([entity, count]) => (
            <div key={entity} className="flex items-center gap-3 border-t px-4 py-2 text-sm first:border-t-0">
              <span className="flex-1">{entityLabel(entity)}</span>
              <span className="text-muted-foreground tabular-nums">{count}</span>
            </div>
          ))}
        </div>
      </div>
      {summary.conflicts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-sm">{m.import_confirm_conflicts()}</span>
          <p className="text-faint text-sm">{m.import_confirm_conflicts_description()}</p>
          <div className="overflow-hidden rounded-lg border bg-card">
            {summary.conflicts.map(conflict => (
              <div
                key={`${conflict.entityType}-${JSON.stringify(conflict.naturalKey)}`}
                className="flex flex-wrap items-center gap-3 border-t px-4 py-2 text-sm first:border-t-0"
              >
                <span className="w-40 shrink-0">{entityLabel(conflict.entityType)}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-faint text-xs">
                  {Object.values(conflict.naturalKey).join(' · ')}
                </span>
                <Status tone={conflict.action === 'skip' ? 'neutral' : 'warning'}>
                  {conflict.action === 'skip' ? m.settings_data_conflict_skip() : m.settings_data_conflict_update()}
                </Status>
              </div>
            ))}
          </div>
        </div>
      )}
      {summary.warnings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-sm">{m.import_confirm_warnings()}</span>
          <ul className="flex list-inside list-disc flex-col gap-1 rounded-lg bg-warning-soft px-4 py-3 text-sm">
            {summary.warnings.map(warning => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      <Form method="post" className="flex gap-2">
        <input type="hidden" name="intent" value="confirm-import" />
        <input type="hidden" name="archive" value={archive} />
        <SubmitButton>{m.settings_data_import_start()}</SubmitButton>
        <Button asChild variant="ghost">
          <Link to="/settings/data">{m.import_confirm_cancel()}</Link>
        </Button>
      </Form>
    </div>
  )
}
