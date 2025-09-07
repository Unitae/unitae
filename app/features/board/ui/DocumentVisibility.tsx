import type { BoardDocument } from '~/database/generated/client'

export function DocumentVisibility({ document }: { document: BoardDocument }) {
  const today = new Date()

  if (document.visibleFrom == null || document.visibleFrom > today) {
    return (
      <span className="inline-block rounded-2xl border border-gray-500 bg-gray-500/25 px-3 text-gray-500 max-sm:h-3 max-sm:w-3 max-sm:px-0">
        <span className="max-sm:hidden">non visible</span>
      </span>
    )
  }

  if (document.visibleUntil != null && document.visibleUntil < today) {
    return (
      <span className="inline-block rounded-2xl border border-gray-500 bg-gray-500/25 px-3 text-gray-500 max-sm:h-3 max-sm:w-3 max-sm:px-0">
        <span className="max-sm:hidden">non visible</span>
      </span>
    )
  }

  if (document.isHighlighted === true) {
    return (
      <span className="inline-block rounded-2xl border border-yellow-500 bg-yellow-500/25 px-3 text-yellow-500 max-sm:h-3 max-sm:w-3 max-sm:px-0">
        <span className="max-sm:hidden">en avant</span>
      </span>
    )
  }

  return (
    <span className="inline-block rounded-2xl border border-green-500 bg-green-500/25 px-3 text-green-500 max-sm:h-3 max-sm:w-3 max-sm:px-0">
      <span className="max-sm:hidden">visible</span>
    </span>
  )
}
