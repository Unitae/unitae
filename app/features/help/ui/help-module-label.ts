import type { HelpModule } from '~/features/help/model/help.type'
import * as m from '~/i18n/paraglide/messages'

// Each module is named by the sidebar or menu entry it belongs to, so the help uses the words the page shows.
const LABELS: Record<HelpModule, () => string> = {
  account: m.account_title,
  absences: m.sidebar_my_absences,
  board: m.sidebar_board,
  publishers: m.sidebar_publishers,
  groups: m.sidebar_publisher_groups,
  activity: m.sidebar_activity,
  programs: m.sidebar_programs,
  'external-speakers': m.sidebar_external_speakers,
  attendance: m.sidebar_attendance,
  'my-territories': m.sidebar_my_territories,
  territories: m.sidebar_territories,
  campaigns: m.sidebar_campaigns,
  prospection: m.sidebar_prospection,
  settings: m.sidebar_settings,
}

export function helpModuleLabel(module: HelpModule): string {
  return LABELS[module]()
}
