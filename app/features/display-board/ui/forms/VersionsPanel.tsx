import { SidePanel, Tag } from '@unitae/ui'
import { Download, RotateCcw } from 'lucide-react'
import { Form, Link } from 'react-router'
import type { DocumentVersionRow } from '~/features/display-board/server/document-form.queries'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

interface VersionsPanelProps {
  documentId: number
  versions: DocumentVersionRow[]
  timeZone: string
  onClose: () => void
}

function formatDay(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(date)
}

/**
 * A PDF's history beside its form: each file it has shown, newest first, to download as it was or to
 * bring back. A document never replaced since versions were kept shows its original file alone.
 */
export function VersionsPanel({ documentId, versions, timeZone, onClose }: VersionsPanelProps) {
  return (
    <SidePanel
      title={m.board_versions_panel_title()}
      description={m.board_versions_panel_description()}
      onClose={onClose}
      closeLabel={m.board_versions_close()}
    >
      <ol className="flex flex-col">
        {versions.length === 0 && (
          <li className="flex items-center justify-between gap-3 border-border border-b py-3">
            <span className="flex flex-col">
              <span className="font-medium">{m.board_versions_original()}</span>
              <span className="text-faint text-sm">{m.board_versions_original_help()}</span>
            </span>
            <Button variant="ghost" size="icon-sm" asChild>
              <Link
                reloadDocument
                to={`/board/documents/${documentId}/view`}
                aria-label={m.board_versions_download_original()}
              >
                <Download className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </li>
        )}
        {versions.map((version, index) => (
          <li key={version.id} className="flex items-center justify-between gap-3 border-border border-b py-3">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-2 font-medium">
                {m.board_versions_version({ number: version.versionNumber })}
                {index === 0 && <Tag tone="brand">{m.board_versions_current()}</Tag>}
              </span>
              <span className="text-faint text-sm">
                {formatDay(version.createdAt, timeZone)}
                {version.uploadedBy && ` · ${m.board_versions_by({ name: version.uploadedBy })}`}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-0.5">
              <Button variant="ghost" size="icon-sm" asChild>
                <Link
                  reloadDocument
                  to={`/board/documents/${documentId}/versions/${version.id}/file`}
                  aria-label={m.board_versions_download({ number: version.versionNumber })}
                >
                  <Download className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              {index > 0 && (
                <Form method="post" action={`/board/documents/${documentId}/versions`}>
                  <input type="hidden" name="versionId" value={version.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    {m.board_versions_restore()}
                  </Button>
                </Form>
              )}
            </span>
          </li>
        ))}
      </ol>
    </SidePanel>
  )
}
