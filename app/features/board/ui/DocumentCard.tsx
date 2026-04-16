import { Calendar, FileText, Star, Users } from 'lucide-react'
import { Link } from 'react-router'

interface PdfDocumentCardItem {
  kind: 'pdf'
  id: number
  title: string
  createdAt: Date
  thumbnailUri: string | null
}

interface DynamicDocumentCardItem {
  kind: 'dynamic'
  id: number
  title: string
  createdAt: Date
  dynamicType: string
}

export type DocumentCardItem = PdfDocumentCardItem | DynamicDocumentCardItem

function getDynamicIcon(dynamicType: string) {
  if (dynamicType === 'publisher-groups') return Users
  if (dynamicType === 'pioneers') return Star
  if (dynamicType === 'programme') return Calendar
  return FileText
}

export function DocumentCard({ file, alreadyViewed = false }: { file: DocumentCardItem; alreadyViewed?: boolean }) {
  const href = file.kind === 'pdf' ? `./documents/${file.id}/viewer` : `./dynamic/${file.id}/viewer`

  return (
    <Link to={href} className="group">
      <div className="relative w-44 rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary max-sm:w-full max-sm:flex-row max-sm:items-center">
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-t-xl bg-muted max-sm:aspect-square max-sm:w-16 max-sm:shrink-0 max-sm:rounded-l-xl max-sm:rounded-tr-none">
          {!alreadyViewed && (
            <div className="absolute top-2 right-2 z-10 size-3.5 rounded-full border-2 border-white bg-destructive shadow-sm" />
          )}
          <CardPreview file={file} />
        </div>

        <div className="flex flex-col gap-1 p-3 max-sm:flex-1 max-sm:py-2">
          <span className="line-clamp-2 font-medium text-foreground text-sm">{file.title}</span>
          <span className="text-muted-foreground text-xs">{new Date(file.createdAt).toLocaleDateString('fr-FR')}</span>
        </div>
      </div>
    </Link>
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
  return <Icon className="size-12 text-muted-foreground max-sm:size-8" />
}
