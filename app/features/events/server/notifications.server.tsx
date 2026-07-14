import { z } from 'zod'
import { defineNotificationType, manifest } from '~/features/notifications'
import * as m from '~/i18n/paraglide/messages'
import ProgrammeAssignmentAssigned from '../emails/programme-assignment-assigned'
import ProgrammeAssignmentUnassigned from '../emails/programme-assignment-unassigned'

const PROGRAMME_CATEGORY = { key: 'programme', label: () => m.notification_category_programme() }

const ASSIGNMENT_PAYLOAD = z.object({
  eventId: z.number().int().positive(),
  eventName: z.string(),
  eventDate: z.string(),
  assignmentName: z.string(),
  role: z.enum(['speaker', 'reader', 'servant']),
  // Pre-resolved public URL (Board dynamic viewer or /board fallback). Baked
  // into the payload at notify() time — see resolveProgrammeLink.
  link: z.string(),
})

// A publisher (or their linked UserAccount) gets a new part or service-role
// assignment. Debounced 2h so an admin planning an entire meeting in one sitting
// batches into fewer emails per assignee — still lands same-day.
const programmeAssignmentAssigned = defineNotificationType({
  type: 'programme.assignment.assigned',
  category: PROGRAMME_CATEGORY,
  label: () => m.notification_programme_assignment_assigned(),
  routing: { debounceMinutes: 120, recipientStrategy: 'entity-user' },
  payload: ASSIGNMENT_PAYLOAD,
  subject: () => m.email_programme_assigned_subject(),
  renderEmail: ({ payload, recipient, congregation }) => (
    <ProgrammeAssignmentAssigned
      email={recipient.email}
      firstname={recipient.firstname ?? undefined}
      eventName={payload.eventName}
      eventDate={payload.eventDate}
      assignmentName={payload.assignmentName}
      role={payload.role}
      link={payload.link}
      baseUrl={congregation.baseUrl}
      platformName={congregation.displayName}
    />
  ),
  example: {
    eventId: 1,
    eventName: 'Sample meeting',
    eventDate: 'Monday, 20 July 2026',
    assignmentName: 'Sample part',
    role: 'speaker' as const,
    link: '/board/dynamic/1/viewer?eventId=1',
  },
})

// Cancels a pending `assigned` for the same assignment+recipient; if none is
// pending (email already went out), sends an instant "cancelled" so the
// assignee gets the correction.
const programmeAssignmentUnassigned = defineNotificationType({
  type: 'programme.assignment.unassigned',
  category: PROGRAMME_CATEGORY,
  label: () => m.notification_programme_assignment_unassigned(),
  routing: {
    cancels: ['programme.assignment.assigned'],
    fallback: { debounceMinutes: 0, recipientStrategy: 'entity-user' },
  },
  payload: ASSIGNMENT_PAYLOAD,
  subject: () => m.email_programme_unassigned_subject(),
  renderEmail: ({ payload, recipient, congregation }) => (
    <ProgrammeAssignmentUnassigned
      email={recipient.email}
      firstname={recipient.firstname ?? undefined}
      eventName={payload.eventName}
      eventDate={payload.eventDate}
      assignmentName={payload.assignmentName}
      role={payload.role}
      link={payload.link}
      baseUrl={congregation.baseUrl}
      platformName={congregation.displayName}
    />
  ),
  example: {
    eventId: 1,
    eventName: 'Sample meeting',
    eventDate: 'Monday, 20 July 2026',
    assignmentName: 'Sample part',
    role: 'speaker' as const,
    link: '/board/dynamic/1/viewer?eventId=1',
  },
})

// `manifest()` erases the payload generic so the central registry can iterate
// definitions without narrowing to a union. See defineNotificationType docs.
export const eventsNotifications = manifest(programmeAssignmentAssigned, programmeAssignmentUnassigned)
