import { StatTile } from '@unitae/ui'
import { UserPlus } from 'lucide-react'

import type { RollChanges } from '~/features/dashboard/server/get-roll-changes.server'
import { DashboardSection, PanelError, PanelFigures, SectionAction } from '~/features/dashboard/ui/DashboardSection'
import * as m from '~/i18n/paraglide/messages'

/**
 * « Proclamateurs », for whoever keeps the roll: its size, and who joined or left since the service
 * year began in September.
 */
export function RollSection({ roll }: { roll: { data: RollChanges | null } }) {
  const data = roll.data
  return (
    <DashboardSection
      title={m.dashboard_roll_total()}
      link={{ to: '/publishers', label: m.dashboard_roll_link() }}
      actions={<SectionAction to="/publishers/new" icon={UserPlus} label={m.dashboard_quick_action_new_publisher()} />}
    >
      {data == null ? (
        <PanelError />
      ) : (
        <PanelFigures>
          <StatTile label={m.dashboard_roll_active()} value={data.total} />
          <StatTile label={m.dashboard_roll_arrived()} value={data.arrived} />
          <StatTile label={m.dashboard_roll_left()} value={data.left} />
        </PanelFigures>
      )}
    </DashboardSection>
  )
}
