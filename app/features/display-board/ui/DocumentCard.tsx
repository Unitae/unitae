import { Calendar, FileText, Star, Users } from 'lucide-react'
import { Link } from 'react-router'
import * as m from '~/paraglide/messages'
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
  if (dynamicType === 'pioneers') return Star
  if (dynamicType === 'programme') return Calendar
  return FileText
}

function getDynamicPreviewBg(dynamicType: string) {
  if (dynamicType === 'publisher-groups') return 'bg-blue-50 dark:bg-blue-950/30'
  if (dynamicType === 'pioneers') return 'bg-amber-50 dark:bg-amber-950/30'
  if (dynamicType === 'programme') return 'bg-teal-50 dark:bg-teal-950/30'
  return 'bg-muted'
}

function getDynamicIconColor(dynamicType: string) {
  if (dynamicType === 'publisher-groups') return 'text-blue-500'
  if (dynamicType === 'pioneers') return 'text-amber-500'
  if (dynamicType === 'programme') return 'text-teal-500'
  return 'text-muted-foreground'
}

function isNewDocument(createdAt: Date | string): boolean {
  const target = createdAt instanceof Date ? createdAt : new Date(createdAt)
  return Date.now() - target.getTime() < 48 * 60 * 60 * 1000
}

interface DocumentCardProps {
  file: DocumentCardItem
  alreadyViewed?: boolean
  variant?: 'default' | 'highlighted'
}

export function DocumentCard({ file, alreadyViewed = false, variant = 'default' }: DocumentCardProps) {
  const href = file.kind === 'pdf' ? `./documents/${file.id}/viewer` : `./dynamic/${file.id}/viewer`
  const isNew = isNewDocument(file.createdAt)
  const hasUpdate = file.kind === 'pdf' && !!file.hasUpdate && alreadyViewed
  const isHighlighted = variant === 'highlighted'

  return (
    <Link to={href} className="group block h-full shrink-0 snap-start">
      <div
        className={cn(
          'relative flex h-full flex-col rounded-xl border bg-card transition-all',
          alreadyViewed
            ? 'border-border shadow-none hover:border-primary hover:shadow-sm'
            : 'border-primary/30 shadow-md hover:border-primary hover:shadow-lg',
          isHighlighted && 'ring-1 ring-primary/20',
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
          {!alreadyViewed && (
            <div className="absolute top-2 right-2 z-10 size-2.5 rounded-full bg-primary ring-2 ring-white shadow-sm" />
          )}
          <FreshnessBadge isNew={isNew} hasUpdate={hasUpdate} />
          <CardPreview file={file} />
        </div>

        <div className="flex flex-col gap-1 p-3 max-sm:min-w-0 max-sm:flex-1 max-sm:px-3 max-sm:py-2">
          <span className={cn('line-clamp-2 text-sm', alreadyViewed ? 'font-medium' : 'font-semibold')}>
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

function FreshnessBadge({ isNew, hasUpdate }: { isNew: boolean; hasUpdate: boolean }) {
  if (hasUpdate) {
    return (
      <div className="absolute top-2 left-2 z-10 max-sm:hidden">
        <Badge variant="info" className="text-xs">
          {m.board_badge_updated()}
        </Badge>
      </div>
    )
  }

  if (isNew) {
    return (
      <div className="absolute top-2 left-2 z-10 max-sm:hidden">
        <Badge variant="default" className="text-xs">
          {m.board_badge_new()}
        </Badge>
      </div>
    )
  }

  return null
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
