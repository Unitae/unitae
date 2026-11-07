import type { DashboardData } from '~/features/dashboard/server/load-dashboard.server'
import { ActivitySection } from '~/features/dashboard/ui/ActivitySection'
import { DocumentsSection } from '~/features/dashboard/ui/DocumentsSection'
import { GroupSection } from '~/features/dashboard/ui/GroupSection'
import { NextMeetingCard } from '~/features/dashboard/ui/NextMeetingCard'
import { ProgrammesSection } from '~/features/dashboard/ui/ProgrammesSection'
import { RollSection } from '~/features/dashboard/ui/RollSection'
import { TerritoriesSection } from '~/features/dashboard/ui/TerritoriesSection'

/** Whether anything goes in the wide column: a responsibility, the meeting, or the documents. */
export function hasWideColumn(data: DashboardData): boolean {
  return (
    [data.group, data.activity, data.territories, data.programmes, data.roll, data.documents].some(
      block => block != null,
    ) || data.meeting?.showCard === true
  )
}

/** The viewer's responsibilities, each with its figures and shortcut. */
function Responsibilities({ data }: { data: DashboardData }) {
  const { visibility } = data
  return (
    <>
      {data.group && <GroupSection group={data.group} />}
      {data.activity && visibility.activity && (
        <ActivitySection activity={data.activity} rights={visibility.activity} />
      )}
      {data.territories && visibility.territories && (
        <TerritoriesSection figures={data.territories} canAssign={visibility.territories.canAssign} />
      )}
      {data.programmes && visibility.programmes && (
        <ProgrammesSection
          open={data.programmes}
          canCreate={visibility.programmes.canCreate}
          timeZone={data.timezone}
        />
      )}
      {data.roll && <RollSection roll={data.roll} />}
    </>
  )
}

/** What concerns the whole congregation, read-only: the next meeting and the latest documents. */
function Congregation({ data }: { data: DashboardData }) {
  const meeting = data.meeting?.showCard ? data.meeting : null
  const documents = data.visibility.documents
  return (
    <>
      {meeting && <NextMeetingCard view={meeting} timeZone={data.timezone} />}
      {data.documents && documents && (
        <DocumentsSection documents={data.documents.data?.recent ?? null} canUpload={documents.canUpload} />
      )}
    </>
  )
}

/** The wide column: responsibilities first, then the congregation. */
export function WideColumn({ data }: { data: DashboardData }) {
  return (
    <>
      <Responsibilities data={data} />
      <Congregation data={data} />
    </>
  )
}
