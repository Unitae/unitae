import { StatTile, type StatTone } from '@unitae/ui'
import { MapPinPlus } from 'lucide-react'

import type { TerritoryTrend } from '~/features/dashboard/server/get-territory-trend.server'
import { DashboardSection, PanelError, PanelFigures, SectionAction } from '~/features/dashboard/ui/DashboardSection'
import { formatDelta, formatShare } from '~/features/dashboard/ui/dashboard-format'
import * as m from '~/i18n/paraglide/messages'

interface TerritoryFigures {
  total: number
  assigned: number
  late: number
  /** Twelve month-end points; null when that query failed, and the figures show without it. */
  trend: TerritoryTrend | null
}

interface TerritoriesSectionProps {
  figures: { data: TerritoryFigures | null }
  canAssign: boolean
}

// Fewer late territories is good news, more is a warning; no change says nothing.
function lateTone(delta: number): StatTone {
  if (delta > 0) return 'warning'
  if (delta < 0) return 'positive'
  return 'neutral'
}

/**
 * « Territoires », for whoever handles attributions: what is out, what is late, how both moved
 * over the year, and the shortcut. The curve is decorative, so each one has its change in words.
 */
export function TerritoriesSection({ figures, canAssign }: TerritoriesSectionProps) {
  const data = figures.data
  return (
    <DashboardSection
      title={m.dashboard_territories_title()}
      link={{ to: '/territories/attributions', label: m.dashboard_attributions_link() }}
      actions={
        canAssign ? (
          <SectionAction
            to="/territories/attributions/new/available-territories"
            icon={MapPinPlus}
            label={m.dashboard_territories_assign()}
          />
        ) : undefined
      }
    >
      {data == null ? <PanelError /> : <TerritoryTiles data={data} />}
    </DashboardSection>
  )
}

function TerritoryTiles({ data }: { data: TerritoryFigures }) {
  const share = m.dashboard_territories_share({ share: formatShare(data.assigned, data.total) })
  const trend = data.trend
  const outDelta = trend ? (trend.out.at(-1) ?? 0) - trend.monthAgo.out : 0
  const lateDelta = trend ? (trend.late.at(-1) ?? 0) - trend.monthAgo.late : 0

  return (
    <PanelFigures>
      <StatTile
        label={m.dashboard_territories_out()}
        value={data.assigned}
        unit={`/ ${data.total}`}
        foot={outDelta === 0 ? share : `${share} · ${m.dashboard_trend_month({ delta: formatDelta(outDelta) })}`}
        trend={trend?.out}
      />
      <StatTile
        label={m.dashboard_territory_overdue()}
        value={data.late}
        foot={trend ? monthChange(lateDelta) : undefined}
        tone={lateTone(lateDelta)}
        trend={trend?.late}
      />
    </PanelFigures>
  )
}

function monthChange(delta: number): string {
  return delta === 0 ? m.dashboard_trend_month_stable() : m.dashboard_trend_month({ delta: formatDelta(delta) })
}
