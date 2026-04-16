import { FileText } from 'lucide-react'
import { Link } from 'react-router'
import type { BoardDocument } from '~/database/generated/client'

export function DocumentCard({ file, alreadyViewed = false }: { file: BoardDocument; alreadyViewed?: boolean }) {
  return (
    <Link reloadDocument to={`./documents/${file.id}/view`} className="group">
      <div className="relative w-44 rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary max-sm:w-full max-sm:flex-row max-sm:items-center">
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-t-xl bg-muted max-sm:aspect-square max-sm:w-16 max-sm:shrink-0 max-sm:rounded-l-xl max-sm:rounded-tr-none">
          {!alreadyViewed && (
            <div className="absolute top-2 right-2 z-10 size-3 rounded-full bg-destructive" />
          )}
          {file.thumbnailUri ? (
            <img
              src={`/board/documents/${file.id}/thumbnail`}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <FileText className="size-12 text-muted-foreground max-sm:size-8" />
          )}
        </div>

        <div className="flex flex-col gap-1 p-3 max-sm:flex-1 max-sm:py-2">
          <span className="line-clamp-2 text-sm font-medium text-foreground">{file.title}</span>
          <span className="text-xs text-muted-foreground">{new Date(file.createdAt).toLocaleDateString('fr-FR')}</span>
        </div>
      </div>
    </Link>
  )
}
