import { Calendar, FileText, Footprints, Users } from 'lucide-react'
import { Link } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'
import { RelativeTime } from '~/shared/ui/RelativeTime'
import { cn } from '~/shared/utils/utils'

interface PdfDocumentCardItem {
  kind: 'pdf'
  id: number
  title: string
  createdAt: Date
  thumbnailUri: string | null
  hasUpdate?: boolean
  alreadyViewed?: boolean
}

interface DynamicDocumentCardItem {
  kind: 'dynamic'
  id: number
  title: string
  createdAt: Date
  dynamicType: string
  preview?: string | null
  alreadyViewed?: boolean
}

export type DocumentCardItem = PdfDocumentCardItem | DynamicDocumentCardItem

function getDynamicIcon(dynamicType: string) {
  if (dynamicType === 'publisher-groups') return Users
  if (dynamicType === 'pioneers') return Footprints
  if (dynamicType === 'programme') return Calendar
  return FileText
}

function getDynamicPreviewBg(dynamicType: string) {
  if (dynamicType === 'publisher-groups') return 'bg-blue-50 dark:bg-blue-950/30'
  if (dynamicType === 'pioneers') return 'bg-emerald-50 dark:bg-emerald-950/30'
  if (dynamicType === 'programme') return 'bg-red-50 dark:bg-red-950/30'
  return 'bg-muted'
}

function getDynamicIconColor(dynamicType: string) {
  if (dynamicType === 'publisher-groups') return 'text-blue-500'
  if (dynamicType === 'pioneers') return 'text-emerald-600'
  if (dynamicType === 'programme') return 'text-red-500'
  return 'text-muted-foreground'
}

function isNewDocument(createdAt: Date | string): boolean {
  const target = createdAt instanceof Date ? createdAt : new Date(createdAt)
  return Date.now() - target.getTime() < 48 * 60 * 60 * 1000
}

interface DocumentCardProps {
  file: DocumentCardItem
  alreadyViewed?: boolean
}

export function DocumentCard({ file, alreadyViewed = false }: DocumentCardProps) {
  const href = file.kind === 'pdf' ? `./documents/${file.id}/viewer` : `./dynamic/${file.id}/viewer`
  const isNew = isNewDocument(file.createdAt)
  const hasUpdate = file.kind === 'pdf' && !!file.hasUpdate && alreadyViewed

  return (
    <Link to={href} className="group block h-full shrink-0 snap-start">
      <div
        className={cn(
          'relative flex h-full flex-col rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary',
          'max-sm:w-full max-sm:flex-row max-sm:items-center',
        )}
      >
        <div
          className={cn(
            'relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-t-xl',
            'max-sm:aspect-auto max-sm:size-14 max-sm:shrink-0 max-sm:rounded-l-xl max-sm:rounded-tr-none',
            file.kind === 'dynamic' ? getDynamicPreviewBg(file.dynamicType) : 'bg-muted',
          )}
        >
          <StatusBadge isNew={isNew} hasUpdate={hasUpdate} alreadyViewed={alreadyViewed} />
          <CardPreview file={file} />
        </div>

        <div className="flex flex-col gap-1 p-3 max-sm:min-w-0 max-sm:flex-1 max-sm:px-3 max-sm:py-2">
          <span className={cn('line-clamp-2 text-sm', alreadyViewed ? 'font-medium' : 'font-semibold')}>
            {!alreadyViewed && (
              <span aria-hidden className="mr-1.5 mb-0.5 inline-block size-2 shrink-0 rounded-full bg-primary" />
            )}
            {file.title}
          </span>
          <span className="text-muted-foreground text-xs">
            <RelativeTime date={file.createdAt} />
          </span>
          {file.kind === 'dynamic' && file.preview && (
            <span className="text-muted-foreground text-xs">{file.preview}</span>
          )}
        </div>
      </div>
    </Link>
  )
}

function StatusBadge({
  isNew,
  hasUpdate,
  alreadyViewed,
}: {
  isNew: boolean
  hasUpdate: boolean
  alreadyViewed: boolean
}) {
  let label: string | null = null
  let badgeClass = ''

  if (hasUpdate) {
    label = m.board_badge_updated()
    badgeClass = 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  } else if (isNew && !alreadyViewed) {
    label = m.board_badge_new()
    badgeClass = 'bg-primary text-primary-foreground'
  } else if (!alreadyViewed) {
    label = m.board_badge_unread()
    badgeClass = 'border-primary bg-secondary text-primary dark:bg-secondary'
  }

  if (!label) return null

  return (
    <div className="absolute top-2 left-2 z-10 max-sm:hidden">
      <Badge variant="outline" className={cn('text-xs', badgeClass)}>
        {label}
      </Badge>
    </div>
  )
}

function CardPreview({ file }: { file: DocumentCardItem }) {
  if (file.kind === 'pdf') {
    if (file.thumbnailUri) {
      return (
        <img
          src={`/board/documents/${file.id}/thumbnail`}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      )
    }
    return <FileText className="size-12 text-muted-foreground max-sm:size-8" />
  }

  const Icon = getDynamicIcon(file.dynamicType)
  return <Icon className={cn('size-12 max-sm:size-8', getDynamicIconColor(file.dynamicType))} />
}
