import { AlertTriangle, CheckCircle2, Repeat } from 'lucide-react'
import type { CadencePayload } from '~/features/events/model/cadence.type'
import { CadenceStrip } from '~/features/events/ui/CadenceStrip'
import { computeCadenceWarnings } from '~/features/events/ui/compute-cadence-warnings'
import * as m from '~/i18n/paraglide/messages'

// Renders the "Rotation sur cette partie" section: header, first-time /
// overdue chips when the visible window is empty, the dot strip otherwise,
// plus the consecutive + rotation-concern warning lines. Shared between the
// three info cards (PublisherInfoCard, ExternalSpeakerInfoCard) so the
// panel doesn't drift as the payload shape grows.
export function CadencePanel({ cadence }: { cadence: CadencePayload }) {
  const warnings = computeCadenceWarnings(cadence)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 font-medium text-muted-foreground text-sm">
        <Repeat className="size-4" />
        {m.publisher_info_cadence()}
      </div>
      {warnings.firstTime && (
        <div className="flex items-center gap-1.5 font-medium text-green-600 text-xs dark:text-green-400">
          <CheckCircle2 className="size-3.5" />
          {m.publisher_info_first_time()}
        </div>
      )}
      {warnings.overdue && (
        <div className="flex items-center gap-1.5 font-medium text-emerald-600 text-xs dark:text-emerald-400">
          <CheckCircle2 className="size-3.5" />
          {m.publisher_info_overdue()}
        </div>
      )}
      {!warnings.firstTime && !warnings.overdue && (
        <CadenceStrip
          past={cadence.past}
          future={cadence.future}
          savedMatchesSelection={cadence.savedMatchesSelection}
        />
      )}
      {warnings.consecutive && (
        <div className="flex items-center gap-1.5 text-orange-600 text-xs dark:text-orange-400">
          <AlertTriangle className="size-3.5" />
          {m.publisher_info_consecutive()}
        </div>
      )}
      {warnings.rotationConcern && (
        <div className="flex items-center gap-1.5 text-orange-600 text-xs dark:text-orange-400">
          <AlertTriangle className="size-3.5" />
          {m.publisher_info_rotation_concern({
            n: String(warnings.rotationConcern.assigned),
            m: String(warnings.rotationConcern.window),
          })}
        </div>
      )}
    </div>
  )
}
