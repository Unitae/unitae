import { type ActivityMonth, monthKey, parseMonthKey } from '~/features/publishers/model/activity-months'
import * as m from '~/i18n/paraglide/messages'
import { useOpenParam } from '~/shared/ui/hooks/use-open-param'
import { useSideEditor } from '~/shared/ui/hooks/use-side-editor'
import { DiscardChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { EmergencyPanel } from './EmergencyPanel'
import type { GroupMemberRow } from './GroupMembersTable'
import { ReportPanel } from './ReportPanel'
import { useOpenFromLink } from './use-open-from-link'
import { useReportQueue } from './use-report-queue'

// The emergency panel shares the side editor with the reports, under a kind of its own.
const EMERGENCY = 'emergency'

interface Options {
  members: GroupMemberRow[]
  inactiveMembers: GroupMemberRow[]
  /** The month being reported, where « Enregistrer et suivant » walks the missing reports. */
  reported: ActivityMonth | undefined
}

/**
 * The group page's report panel: any member's month, opened from a dot, the name or « Saisir »; docked beside the list
 * from 1280 px, in a sheet below. On the month being reported, « Enregistrer et suivant » goes to the next member of
 * the group still without a report.
 */
export function useGroupReportEditor({ members, inactiveMembers, reported }: Options) {
  const editor = useSideEditor<string>(target =>
    [...members, ...inactiveMembers].some(member => member.id === target.id),
  )
  const target = editor.target
  const month = target && target.kind !== EMERGENCY ? parseMonthKey(target.kind) : null
  const onReportedMonth = month != null && reported != null && monthKey(month) === monthKey(reported)

  const openReport = (memberId: number, at: ActivityMonth, trigger: HTMLElement | null) =>
    editor.request({ kind: monthKey(at), id: memberId, trigger })

  const queue = useReportQueue({
    rows: members,
    isMissing: member => member.reports.at(-1)?.status === 'not-filed',
    currentId: onReportedMonth ? (target?.id ?? null) : null,
    onStep: member => reported && openReport(member.id, reported, null),
    onAdvance: member => reported && editor.open({ kind: monthKey(reported), id: member.id, trigger: null }),
    onEnd: editor.close,
  })

  useOpenFromLink(
    (memberId, params) => {
      const linked = { month: Number(params.get('month')), year: Number(params.get('year')) }
      const at = Number.isInteger(linked.month) && Number.isInteger(linked.year) ? linked : reported
      if (at) editor.open({ kind: monthKey(at), id: memberId, trigger: null })
    },
    ['month', 'year'],
  )

  // `?emergency=<memberId>`, from an old emergency link: that member's panel.
  useOpenParam(EMERGENCY, value => {
    const memberId = Number(value)
    if (Number.isInteger(memberId)) editor.open({ kind: EMERGENCY, id: memberId, trigger: null })
  })

  const emergency = target?.kind === EMERGENCY && target.id != null && (
    <EmergencyPanel
      key={`${target.id}:emergency`}
      publisherId={target.id}
      docked={editor.docked}
      trigger={target.trigger}
      formRef={editor.formRef}
      onRequestClose={() => editor.request(null)}
      onClose={editor.close}
    />
  )

  const report = target?.id != null && month != null && (
    <ReportPanel
      key={`${target.id}:${target.kind}`}
      target={{ publisherId: target.id, ...month, trigger: target.trigger }}
      docked={editor.docked}
      formRef={editor.formRef}
      onRequestClose={() => editor.request(null)}
      onClose={editor.close}
      onSaved={next => (next ? queue.advance() : editor.close())}
      queue={queue.position}
    />
  )

  return {
    docked: editor.docked,
    panel: emergency || report,
    discard: (
      <DiscardChangesDialog
        {...editor.discard}
        description={m.common_discard_changes_description()}
        discardLabel={m.common_discard_changes_confirm()}
      />
    ),
    selected: target?.id != null && month != null ? { memberId: target.id, month } : null,
    open: (memberId: number, at: ActivityMonth, trigger: HTMLElement) => openReport(memberId, at, trigger),
    openEmergency: (memberId: number, trigger: HTMLElement) =>
      editor.request({ kind: EMERGENCY, id: memberId, trigger }),
  }
}
