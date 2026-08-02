import type { RiskBucket } from '~/features/publishers'

// A tiny inline trend mark. Recharts is overkill at 88×24; this is the one place a
// hand-rolled SVG is justified. Decorative (aria-hidden="true") — the numeric trend word is
// rendered as text beside it for screen readers.
const WIDTH = 88
const HEIGHT = 24
const PADDING = 2

// The stroke agrees with the row's risk badge so the trend reads at a glance.
const STROKE: Record<RiskBucket, string> = {
  red: 'stroke-destructive',
  amber: 'stroke-amber-500 dark:stroke-amber-400',
  green: 'stroke-[color:var(--color-chart-1)]',
}

export function Sparkline({
  values,
  rate,
  risk = 'green',
  muted = false,
}: {
  values: (number | null)[]
  rate?: number
  risk?: RiskBucket
  // Render neutral (no risk colour) — e.g. a concluded pioneer, who is out of the risk queue.
  muted?: boolean
}) {
  const points = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null)

  if (points.length < 2) return <span className="text-muted-foreground text-xs">—</span>

  const max = Math.max(rate ?? 0, ...points.map(p => p.v)) || 1
  const stepX = (WIDTH - PADDING * 2) / Math.max(values.length - 1, 1)
  const y = (v: number) => HEIGHT - PADDING - (v / max) * (HEIGHT - PADDING * 2)
  const x = (i: number) => PADDING + i * stepX

  const line = points.map(p => `${x(p.i)},${y(p.v)}`).join(' ')

  return (
    <svg width={WIDTH} height={HEIGHT} aria-hidden="true">
      {rate !== undefined && (
        <line
          x1={PADDING}
          x2={WIDTH - PADDING}
          y1={y(rate)}
          y2={y(rate)}
          strokeDasharray="2 2"
          className="stroke-muted-foreground/50"
          strokeWidth={1}
        />
      )}
      <polyline
        points={line}
        fill="none"
        strokeWidth={1.5}
        className={muted ? 'stroke-muted-foreground' : STROKE[risk]}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
