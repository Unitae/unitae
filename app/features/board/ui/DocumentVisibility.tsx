import type { BoardDocument } from '~/database/generated/client'
import { Badge } from '~/shared/ui/badge'

export function DocumentVisibility({ document }: { document: BoardDocument }) {
  const today = new Date()

  if (document.visibleFrom == null || document.visibleFrom > today) {
    return (
      <Badge variant="secondary" className="max-sm:size-3 max-sm:p-0">
        <span className="max-sm:hidden">non visible</span>
      </Badge>
    )
  }

  if (document.visibleUntil != null && document.visibleUntil < today) {
    return (
      <Badge variant="secondary" className="max-sm:size-3 max-sm:p-0">
        <span className="max-sm:hidden">non visible</span>
      </Badge>
    )
  }

  if (document.isHighlighted === true) {
    return (
      <Badge className="border-yellow-500 bg-yellow-500/25 text-yellow-600 hover:bg-yellow-500/25 max-sm:size-3 max-sm:p-0 dark:text-yellow-400">
        <span className="max-sm:hidden">en avant</span>
      </Badge>
    )
  }

  return (
    <Badge className="border-green-500 bg-green-500/25 text-green-600 hover:bg-green-500/25 max-sm:size-3 max-sm:p-0 dark:text-green-400">
      <span className="max-sm:hidden">visible</span>
    </Badge>
  )
}
