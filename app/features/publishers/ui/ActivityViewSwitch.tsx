import { SegmentedControl } from '@unitae/ui'
import { useNavigate } from 'react-router'

import * as m from '~/i18n/paraglide/messages'

type ActivityView = 'reports' | 'pioneers'

const PATHS: Record<ActivityView, string> = {
  reports: '/publishers/activity',
  pioneers: '/publishers/activity/pioneers',
}

/** Reports or pioneers: the two views of the activity page, on the title's row. */
export function ActivityViewSwitch({ value }: { value: ActivityView }) {
  const navigate = useNavigate()
  return (
    <SegmentedControl
      aria-label={m.activity_view_label()}
      value={value}
      onValueChange={next => navigate(PATHS[next])}
      options={[
        { value: 'reports', label: m.activity_view_reports() },
        { value: 'pioneers', label: m.pioneers_tab_pioneers() },
      ]}
      className="w-52 max-sm:w-full"
    />
  )
}
