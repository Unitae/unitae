import type { Attribution } from '~/database/generated/client'

export function AttributionStatus({ attribution }: { attribution: Attribution }) {
  if (attribution.lateDate == null || attribution.lateDate < new Date()) {
    return (
      <span className="inline-block rounded-2xl border border-orange-500 bg-orange-500/25 px-3 text-orange-500 max-sm:h-3 max-sm:w-3 max-sm:px-0">
        <span className="max-sm:hidden">en retard</span>
      </span>
    )
  }

  return (
    <span className="inline-block rounded-2xl border border-green-500 bg-green-500/25 px-3 text-green-500 max-sm:h-3 max-sm:w-3 max-sm:px-0">
      <span className="max-sm:hidden">en cours</span>
    </span>
  )
}
