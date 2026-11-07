import { FilePlus2, FileText } from 'lucide-react'
import { Link } from 'react-router'

import type { getRecentDocuments } from '~/features/dashboard/server/dashboard.server'
import {
  DashboardSection,
  PanelEmpty,
  PanelError,
  panelLinkRowClass,
  SectionAction,
} from '~/features/dashboard/ui/DashboardSection'
import * as m from '~/i18n/paraglide/messages'
import { RelativeTime } from '~/shared/ui/RelativeTime'
import { cn } from '~/shared/utils/utils'

type Documents = Awaited<ReturnType<typeof getRecentDocuments>>

/** The latest board documents; unread ones carry a dot and stay in full weight. */
export function DocumentsSection({ documents, canUpload }: { documents: Documents | null; canUpload: boolean }) {
  const hasItems = documents != null && documents.length > 0
  return (
    <DashboardSection
      title={m.dashboard_recent_documents()}
      link={hasItems ? { to: '/board', label: m.dashboard_documents_link() } : undefined}
      actions={
        canUpload ? (
          <SectionAction to="/board/documents/new" icon={FilePlus2} label={m.dashboard_documents_add()} />
        ) : undefined
      }
    >
      {documents == null ? (
        <PanelError />
      ) : documents.length === 0 ? (
        <PanelEmpty icon={FileText} title={m.dashboard_no_documents()} />
      ) : (
        documents.map(doc => (
          <Link
            key={`${doc.kind}-${doc.id}`}
            to={doc.kind === 'pdf' ? `/board/documents/${doc.id}/viewer` : `/board/dynamic/${doc.id}/viewer`}
            className={panelLinkRowClass}
          >
            <span
              aria-hidden="true"
              className={cn('size-1.5 shrink-0 rounded-full', doc.alreadyViewed ? 'bg-transparent' : 'bg-brand')}
            />
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm',
                doc.alreadyViewed ? 'text-muted-foreground' : 'font-medium',
              )}
            >
              {doc.title}
            </span>
            <span className="shrink-0 text-faint text-xs">
              <RelativeTime date={doc.createdAt} />
            </span>
          </Link>
        ))
      )}
    </DashboardSection>
  )
}
