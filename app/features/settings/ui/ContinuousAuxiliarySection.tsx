import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { SettingRow } from '~/shared/ui/SettingRow'
import { Switch } from '~/shared/ui/switch'

interface ContinuousAuxiliarySectionProps {
  name: string
  defaultChecked: boolean
  /** Who holds a continuous enrolment now: turning the option off would end theirs. */
  enrolled: string[]
}

/** Whether a publisher record offers the continuous auxiliary enrolment, naming whom turning it off would stop. */
export function ContinuousAuxiliarySection({ name, defaultChecked, enrolled }: ContinuousAuxiliarySectionProps) {
  const [checked, setChecked] = useState(defaultChecked)
  const stopping = defaultChecked && !checked && enrolled.length > 0
  const names = new Intl.ListFormat(getLocale(), { type: 'conjunction' }).format(enrolled)

  return (
    <div className="col-span-full flex flex-col gap-2">
      <div className="overflow-hidden rounded-lg border bg-card">
        <SettingRow
          htmlFor="continuous-auxiliary"
          title={m.settings_publishers_continuous_label()}
          description={m.settings_publishers_continuous_description()}
        >
          <Switch id="continuous-auxiliary" name={name} checked={checked} onCheckedChange={setChecked} />
        </SettingRow>
      </div>
      {stopping && (
        <p role="status" className="flex gap-2 rounded-md bg-warning-soft px-3 py-2.5 text-sm">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          {(enrolled.length === 1
            ? m.settings_publishers_continuous_stops_one
            : m.settings_publishers_continuous_stops_many)({ names })}
        </p>
      )}
    </div>
  )
}
