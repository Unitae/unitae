import { AlertCircle, FileText } from 'lucide-react'
import { Link } from 'react-router'
import type { BoardDocument } from '~/database/generated/client'
import { Card, CardContent } from '~/shared/ui/card'

export function DocumentCard({ file, alreadyViewed = false }: { file: BoardDocument; alreadyViewed?: boolean }) {
  return (
    <Link reloadDocument to={`./documents/${file.id}/view`} className="group">
      <Card className="relative w-40 border-border transition-colors hover:border-primary max-sm:w-full">
        {!alreadyViewed && (
          <div className="absolute -top-2.5 -right-2.5">
            <div className="flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
              <AlertCircle className="size-3.5" />
            </div>
          </div>
        )}
        <CardContent className="flex flex-col items-center justify-center px-3 py-5 text-center text-muted-foreground max-sm:flex-row max-sm:justify-between">
          {file.thumbnailUri ? (
            <img
              src={`./documents/${file.id}/thumbnail`}
              alt=""
              className="mb-3 h-20 w-auto rounded object-contain max-sm:mb-0 max-sm:h-10"
              loading="lazy"
            />
          ) : (
            file.type === 'pdf' && <FileText className="mb-3 size-16 max-sm:mb-0 max-sm:size-10" />
          )}
          <span className="text-foreground text-sm">{file.title}</span>
          <span className="mt-2 text-muted-foreground text-xs max-sm:mt-0">
            {new Date(file.createdAt).toLocaleDateString('fr-FR')}
          </span>
        </CardContent>
      </Card>
    </Link>
  )
}
