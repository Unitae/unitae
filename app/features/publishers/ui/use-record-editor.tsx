import { type ActivityMonth, monthKey, parseMonthKey } from '~/features/publishers/model/activity-months'
import type { EnrolmentOptions, RecordEnrolment } from '~/features/publishers/model/publisher-record.type'
import * as m from '~/i18n/paraglide/messages'
import { useSideEditor } from '~/shared/ui/hooks/use-side-editor'
import { DiscardChangesDialog } from '~/shared/ui/UnsavedChangesDialog'

import { EmergencyPanel } from './EmergencyPanel'
import { EnrolmentPanel } from './EnrolmentPanel'
import { ReportPanel } from './ReportPanel'
import { useOpenParam } from './use-open-from-link'

const EMERGENCY = 'emergency'
// A new enrolment is `enrol`; correcting one is `enrol-<its id>`, so two stints are two items to switch between.
const ENROL = 'enrol'
const enrolKey = (id: number) => `${ENROL}-${id}`

interface EnrolmentContext {
  name: string
  enrolments: RecordEnrolment[]
  /** The dialogs' choices, for a manager; null for anyone else, who has nothing to open. */
  options: EnrolmentOptions | null
}

/**
 * The record's side panel: the person's emergency information, a pioneer enrolment to make or correct, or one month's
 * report, opened from the record. Docked beside it from 1280 px, a sheet below; switching from a form with changes asks
 * first. `?panel=emergency` opens the emergency information.
 */
export function useRecordEditor(publisherId: number, enrolment: EnrolmentContext) {
  const editor = useSideEditor<string>(target => target.id === publisherId)
  const target = editor.target
  const isEnrolment = target != null && (target.kind === ENROL || target.kind.startsWith(`${ENROL}-`))
  const month = target && target.kind !== EMERGENCY && !isEnrolment ? parseMonthKey(target.kind) : null
  const corrected = target?.kind.startsWith(`${ENROL}-`)
    ? enrolment.enrolments.find(each => enrolKey(each.id) === target.kind)
    : undefined

  useOpenParam('panel', value => {
    if (value === EMERGENCY) editor.open({ kind: EMERGENCY, id: publisherId, trigger: null })
  })

  const shared = {
    docked: editor.docked,
    formRef: editor.formRef,
    onRequestClose: () => editor.request(null),
    onClose: editor.close,
  }
  let panel = null
  if (isEnrolment && enrolment.options && (target?.kind === ENROL || corrected)) {
    panel = (
      <EnrolmentPanel
        key={target?.kind}
        publisherId={publisherId}
        name={enrolment.name}
        options={enrolment.options}
        enrolment={corrected}
        trigger={target?.trigger ?? null}
        {...shared}
      />
    )
  } else if (target?.kind === EMERGENCY) {
    panel = <EmergencyPanel key="emergency" publisherId={publisherId} trigger={target.trigger} {...shared} />
  } else if (target && month) {
    panel = (
      <ReportPanel
        key={target.kind}
        target={{ publisherId, ...month, trigger: target.trigger }}
        onSaved={editor.close}
        queue={null}
        {...shared}
      />
    )
  }

  return {
    docked: editor.docked,
    panel,
    discard: (
      <DiscardChangesDialog
        {...editor.discard}
        description={m.common_discard_changes_description()}
        discardLabel={m.common_discard_changes_confirm()}
      />
    ),
    selectedMonth: month,
    emergencyOpen: target?.kind === EMERGENCY,
    /** The enrolment open in the panel: `new` while enrolling, its id while correcting it. */
    enrolmentOpen: (isEnrolment ? (corrected?.id ?? 'new') : null) as number | 'new' | null,
    openEnrolment: (trigger: HTMLElement, corrected?: RecordEnrolment) =>
      editor.request({ kind: corrected ? enrolKey(corrected.id) : ENROL, id: publisherId, trigger }),
    openEmergency: (trigger: HTMLElement) => editor.request({ kind: EMERGENCY, id: publisherId, trigger }),
    openReport: (at: ActivityMonth, trigger: HTMLElement) =>
      editor.request({ kind: monthKey(at), id: publisherId, trigger }),
  }
}
