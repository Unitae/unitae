import type { DashboardVisibility } from '~/features/dashboard/model/dashboard-visibility'
import { meetingForViewer } from '~/features/dashboard/model/meeting-visibility'
import { getNextMeeting } from '~/features/dashboard/server/dashboard.server'
import { isProgrammeOnBoardFor } from '~/features/dashboard/server/programme-board-visibility.server'
import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'
import { canEditEvent } from '~/features/events/server/events-auth.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

// Member ids start at 1: an account without a member record holds no part.
const NO_MEMBER = 0

interface MeetingViewer {
  accountId: number
  memberId: number | null
  congregationId: number
  permissions: ReadonlySet<Permission>
  audience: DashboardVisibility['meetingAudience']
}

type NextMeeting = NonNullable<Awaited<ReturnType<typeof getNextMeeting>>>

export interface MeetingForViewer {
  /** Trimmed to what the viewer may read (see meetingForViewer). */
  meeting: NextMeeting
  /** The schedule card: programme readers, and board readers whose board shows this programme. */
  showCard: boolean
  /** May fill its slots: sees absence conflicts, and open slots lead to the editor. */
  canAct: boolean
  /** Where the card leads: the editor for those who act or read programmes, else the board. */
  link: string
}

/**
 * The next meeting as one viewer may see it. Reading follows « could read it elsewhere »;
 * acting follows the assign route's own check (the programmes must open for them, and they must
 * hold the assign permission or answer for this meeting type).
 */
export async function nextMeetingForViewer(
  db: TransactionClient,
  viewer: MeetingViewer,
): Promise<MeetingForViewer | null> {
  const { accountId, memberId, congregationId, permissions, audience } = viewer
  const meeting = await getNextMeeting(db, memberId ?? NO_MEMBER, congregationId)
  if (meeting == null) return null

  const can = (permission: Permission) => permissions.has(permission)
  const schedule =
    audience === 'programmes' ||
    (audience === 'board' && (await isProgrammeOnBoardFor(db, meeting.link, accountId, congregationId)))
  const canAct =
    can(Permission.CanViewPrograms) &&
    (await canEditEvent(
      db,
      can,
      accountId,
      meeting.templateId,
      congregationId,
      Permission.CanAssignProgramParts,
      ResponsibilityScope.Programme,
    ))

  return {
    meeting: meetingForViewer(meeting, { schedule, conflicts: canAct }),
    showCard: schedule,
    canAct,
    link: audience === 'programmes' ? `/programs/events/${meeting.id}` : meeting.link,
  }
}
