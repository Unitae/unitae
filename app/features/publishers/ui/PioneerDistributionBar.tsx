import type { PioneerActivityTotals } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent } from '~/shared/ui/card'
import { Progress } from '~/shared/ui/progress'

const SEGMENTS = [
  { key: 'atRisk' as const, className: 'bg-destructive', label: () => m.pioneers_total_at_risk() },
  { key: 'behind' as const, className: 'bg-amber-500 dark:bg-amber-400', label: () => m.pioneers_total_behind() },
  { key: 'onTrack' as const, className: 'bg-green-600 dark:bg-green-500', label: () => m.pioneers_total_on_track() },
]

export function PioneerDistributionBar({ totals }: { totals: PioneerActivityTotals }) {
  const total = totals.onTrack + totals.behind + totals.atRisk
  const hoursPct = totals.targetHours > 0 ? Math.round((totals.actualHours / totals.targetHours) * 100) : 0

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="h-full">
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-baseline gap-2">
            <span
              className={`font-black text-4xl tracking-tight ${totals.atRisk > 0 ? 'text-destructive' : 'text-foreground'}`}
            >
              {totals.atRisk}
            </span>
            <span className="text-muted-foreground text-sm">{m.pioneers_total_at_risk()}</span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {total > 0 &&
              SEGMENTS.map(seg => {
                const value = totals[seg.key]
                if (value === 0) return null
                return <div key={seg.key} className={seg.className} style={{ width: `${(value / total) * 100}%` }} />
              })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
            {SEGMENTS.map(seg => (
              <span key={seg.key} className="flex items-center gap-1.5">
                <span className={`inline-block size-2 rounded-full ${seg.className}`} aria-hidden />
                {totals[seg.key]} {seg.label()}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="h-full">
        <CardContent className="flex flex-col justify-center gap-2 p-4">
          <div className="flex items-baseline gap-2">
            <span className="font-black text-4xl tracking-tight">
              {Math.min(hoursPct, 100)}
              <span className="text-lg text-muted-foreground">%</span>
            </span>
            <span className="text-muted-foreground text-sm">{m.pioneers_collective_hours()}</span>
          </div>
          <div className="text-muted-foreground text-sm tabular-nums">
            {totals.actualHours} / {totals.targetHours} h
          </div>
          <Progress value={Math.min(hoursPct, 100)} />
        </CardContent>
      </Card>
    </div>
  )
}
