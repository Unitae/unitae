import { StatTile } from '@unitae/ui'
import { MapPinPlus } from 'lucide-react'

import { DashboardSection, PanelError, PanelFigures, SectionAction } from '~/features/dashboard/ui/DashboardSection'
import { formatShare } from '~/features/dashboard/ui/dashboard-format'
import * as m from '~/i18n/paraglide/messages'

interface TerritoriesSectionProps {
  figures: { data: { total: number; assigned: number; late: number } | null }
  canAssign: boolean
}

/** « Territoires », for whoever handles attributions: what is out, what is late, and the shortcut. */
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
      {data == null ? (
        <PanelError />
      ) : (
        <PanelFigures>
          <StatTile
            label={m.dashboard_territories_out()}
            value={data.assigned}
            unit={`/ ${data.total}`}
            foot={m.dashboard_territories_share({ share: formatShare(data.assigned, data.total) })}
          />
          <StatTile
            label={m.dashboard_territory_overdue()}
            value={data.late}
            tone={data.late > 0 ? 'warning' : 'neutral'}
          />
        </PanelFigures>
      )}
    </DashboardSection>
  )
}
