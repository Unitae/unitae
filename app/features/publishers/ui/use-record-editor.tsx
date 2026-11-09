import { type ActivityMonth, monthKey, parseMonthKey } from '~/features/publishers/model/activity-months'
import * as m from '~/i18n/paraglide/messages'
import { useSideEditor } from '~/shared/ui/hooks/use-side-editor'
import { DiscardChangesDialog } from '~/shared/ui/UnsavedChangesDialog'

import { EmergencyPanel } from './EmergencyPanel'
import { ReportPanel } from './ReportPanel'
import { useOpenParam } from './use-open-from-link'

const EMERGENCY = 'emergency'

/**
 * The record's side panel: the person's emergency information, or one month's report, opened from the record. Docked
 * beside it from 1280 px, a sheet below; switching from a form with changes asks first. `?panel=emergency` opens it.
 */
export function useRecordEditor(publisherId: number) {
  const editor = useSideEditor<string>(target => target.id === publisherId)
  const target = editor.target
  const month = target && target.kind !== EMERGENCY ? parseMonthKey(target.kind) : null

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
  if (target?.kind === EMERGENCY) {
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
    openEmergency: (trigger: HTMLElement) => editor.request({ kind: EMERGENCY, id: publisherId, trigger }),
    openReport: (at: ActivityMonth, trigger: HTMLElement) =>
      editor.request({ kind: monthKey(at), id: publisherId, trigger }),
  }
}
