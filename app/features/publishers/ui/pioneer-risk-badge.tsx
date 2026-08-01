import { Check, CircleAlert, Clock, TriangleAlert } from 'lucide-react'

import type { PioneerPace, ReportingStatus, RiskBucket } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'

const RISK_META: Record<
  RiskBucket,
  { variant: 'success' | 'warning' | 'destructive'; icon: typeof Check; label: () => string }
> = {
  green: { variant: 'success', icon: Check, label: () => m.pioneers_risk_green() },
  amber: { variant: 'warning', icon: TriangleAlert, label: () => m.pioneers_risk_amber() },
  red: { variant: 'destructive', icon: CircleAlert, label: () => m.pioneers_risk_red() },
}

// Plain-language pace, e.g. "22 h de retard" / "18 h d'avance" / "dans les temps".
export function paceLabel(pace: PioneerPace): string {
  if (pace.paceDelta > 0) return m.pioneers_pace_ahead({ hours: String(pace.paceDelta) })
  if (pace.paceDelta < 0) return m.pioneers_pace_behind({ hours: String(Math.abs(pace.paceDelta)) })
  return m.pioneers_pace_on_track()
}

// Risk is encoded in three channels (colour + icon + word) — never colour alone.
export function PioneerRiskBadge({ bucket, label }: { bucket: RiskBucket; label?: string }) {
  const meta = RISK_META[bucket]
  const Icon = meta.icon
  return (
    <Badge variant={meta.variant} className="gap-1">
      <Icon className="size-3" aria-hidden />
      <span>{label ?? meta.label()}</span>
    </Badge>
  )
}

// Reporting status is a separate, neutral signal from pace — never folded into it.
export function ReportingChip({ status }: { status: ReportingStatus }) {
  if (status === 'filed') return null
  const label = status === 'awaiting' ? m.pioneers_report_awaiting() : m.pioneers_report_overdue()
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Clock className="size-3" aria-hidden />
      <span>{label}</span>
    </Badge>
  )
}
