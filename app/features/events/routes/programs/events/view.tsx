import {
  AlertTriangle,
  Clock,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Link, redirect, useFetcher } from 'react-router'
import { resolveProgrammeLink } from '~/features/display-board/index.server'
import { EventStatus } from '~/features/events/model/event-status.type'
import {
  getPartAssignmentAllowedRoleIds,
  getServicePartAssignmentAllowedRoleIds,
  resolveEligibleUserIds,
} from '~/features/events/server/allowed-roles.server'
import { buildAssignmentShareText } from '~/features/events/server/build-share-message.server'
import { getEventProgramme } from '~/features/events/server/event-part-assignments.server'
import { canEditEvent } from '~/features/events/server/events-auth.server'
import { listExternalSpeakers } from '~/features/events/server/external-speakers.server'
import { AssignPartSheet } from '~/features/events/ui/AssignPartSheet'
import { AssignServiceSheet } from '~/features/events/ui/AssignServiceSheet'
import { ShareAssignmentButton } from '~/features/events/ui/ShareAssignmentButton'
import { UnassignConfirmDialog } from '~/features/events/ui/UnassignConfirmDialog'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { formatEventDate, formatEventTime } from '~/shared/utils/event-time'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/view'

type PartRowAssignment = {
  id: number
  name: string
  topic: string
  section: string
  track: string
  durationMin: number | null
  assigneeId: number | null
  assistantId: number | null
  allowExternalSpeaker: boolean
  externalSpeakerId: number | null
  externalSpeaker: { name: string } | null
  hasConflict: boolean
  speakerLabel: string | null
  readerLabel: string | null
  assignee: { firstname: string | null; lastname: string | null } | null
  assistant: { firstname: string | null; lastname: string | null } | null
}

export const meta: Route.MetaFunction = () => {
  return [{ title: m.programs_view_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  requirePermission(permissions, Permission.ProgramViewer)

  const eventId = requireParamId(params.eventId, '/programs')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Permission) => permissions.has(role)
    const event = await getEventProgramme(db, eventId, congregationId)
    if (!event) throw redirect('/programs')

    const canEdit = await canEditEvent(db, can, currentUser.id, event.templateId, congregationId)

    const users = canEdit
      ? await db.member.findMany({
          where: { congregationId, leftAt: null },
          orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
        })
      : []

    const externalSpeakers = canEdit
      ? (await listExternalSpeakers(db, congregationId, { includeArchived: false }))
          .slice()
          .sort((a, b) => {
            const aTime = a.lastVisitDate?.getTime() ?? -Infinity
            const bTime = b.lastVisitDate?.getTime() ?? -Infinity
            if (aTime === bTime) return a.name.localeCompare(b.name, 'fr')
            return aTime - bTime
          })
          .map(s => ({ id: s.id, name: s.name }))
      : []

    const partCandidates: Record<number, { speakerIds: number[]; readerIds: number[] }> = {}
    const serviceCandidates: Record<number, number[]> = {}
    if (canEdit) {
      const userById = new Map(users.map(u => [u.id, u]))
      for (const assignment of event.eventParts) {
        const speakerAllowed = await getPartAssignmentAllowedRoleIds(db, assignment.id, 'speaker', congregationId)
        const readerAllowed = await getPartAssignmentAllowedRoleIds(db, assignment.id, 'reader', congregationId)
        const speakerIds = await resolveEligibleUserIds(db, speakerAllowed, congregationId)
        const readerIds = await resolveEligibleUserIds(db, readerAllowed, congregationId)
        partCandidates[assignment.id] = {
          speakerIds: speakerIds.filter(id => userById.has(id)),
          readerIds: readerIds.filter(id => userById.has(id)),
        }
      }
      for (const assignment of event.eventServiceParts) {
        const allowed = await getServicePartAssignmentAllowedRoleIds(db, assignment.id, congregationId)
        const eligible = await resolveEligibleUserIds(db, allowed, congregationId)
        serviceCandidates[assignment.id] = eligible.filter(id => userById.has(id))
      }
    }

    // Built here rather than on click: navigator.share needs the user's
    // activation, and awaiting anything before it spends that activation.
    // One link lookup for the whole event, then pure string work per part.
    const congregation = context.get(congregationContext)
    const shareTexts: Record<number, string> = {}
    if (canEdit) {
      const link = await resolveProgrammeLink(db, { id: event.id, templateId: event.templateId }, congregationId)
      for (const assignment of event.eventParts) {
        const text = buildAssignmentShareText({
          part: assignment,
          event,
          link,
          baseUrl: congregation.baseUrl,
          congregationName: congregation.displayName,
          locale: congregation.locale,
          timezone: congregation.timezone,
        })
        // Absent for an unassigned part, a part with no kind, or a kind with no
        // wording — the button simply does not appear for those.
        if (text) shareTexts[assignment.id] = text
      }
    }

    logger.info(`Loading event programme. User ID: ${currentUser.id}. Event ID: ${eventId}.`)

    return {
      event,
      canEdit,
      users,
      externalSpeakers,
      partCandidates,
      serviceCandidates,
      shareTexts,
      timezone: congregation.timezone,
    }
  })
}

export default function EventViewPage({ loaderData }: Route.ComponentProps) {
  const { event, canEdit, users, externalSpeakers, partCandidates, serviceCandidates, shareTexts, timezone } =
    loaderData

  const userById = new Map(users.map(u => [u.id, u]))

  const [assignPartTarget, setAssignPartTarget] = useState<{
    id: number
    name: string
    section: string
    track: string
    topic: string
    durationMin: number | null
    assigneeId: number | null
    assistantId: number | null
    allowExternalSpeaker: boolean
    externalSpeakerId: number | null
    speakerLabel: string | null
    readerLabel: string | null
  } | null>(null)
  const [assignPartOpen, setAssignPartOpen] = useState(false)

  const [assignServiceTarget, setAssignServiceTarget] = useState<{
    id: number
    name: string
    assigneeId: number | null
  } | null>(null)
  const [assignServiceOpen, setAssignServiceOpen] = useState(false)

  const [unassignTarget, setUnassignTarget] = useState<{
    type: 'part' | 'service'
    id: number
    name: string
    assigneeName: string
  } | null>(null)

  // Derived values
  const hasAnyTopic = event.eventParts.some(a => a.topic)
  const partAssignedCount = event.eventParts.filter(a => a.assigneeId ?? a.externalSpeakerId).length
  const serviceAssignedCount = event.eventServiceParts.filter(a => a.assigneeId).length

  // Group parts by section, then by track within each section
  type PartAssignment = (typeof event.eventParts)[number]
  type TrackGroup = { track: string; eventParts: PartAssignment[] }
  type SectionGroup = { section: string; tracks: TrackGroup[] }

  const partsBySection: SectionGroup[] = []
  let currentSection: string | null = null
  let currentTrack: string | null = null

  for (const part of event.eventParts) {
    const section = part.section || ''
    const track = part.track || ''

    if (section !== currentSection) {
      partsBySection.push({ section, tracks: [{ track, eventParts: [] }] })
      currentSection = section
      currentTrack = track
    } else if (track !== currentTrack) {
      partsBySection.at(-1)?.tracks.push({ track, eventParts: [] })
      currentTrack = track
    }

    const lastSection = partsBySection.at(-1)
    lastSection?.tracks.at(-1)?.eventParts.push(part)
  }

  const colCount = 4 + (hasAnyTopic ? 1 : 0) + (canEdit ? 1 : 0)

  const startTime = formatEventTime(event.startDate, timezone)
  const endTime = formatEventTime(event.endDate, timezone)
  const dateStr = formatEventDate(event.startDate, timezone, 'fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  function openPartAssign(assignment: PartRowAssignment) {
    setAssignPartTarget({
      id: assignment.id,
      name: assignment.name,
      section: assignment.section,
      track: assignment.track,
      topic: assignment.topic,
      durationMin: assignment.durationMin,
      assigneeId: assignment.assigneeId,
      assistantId: assignment.assistantId,
      allowExternalSpeaker: assignment.allowExternalSpeaker,
      externalSpeakerId: assignment.externalSpeakerId,
      speakerLabel: assignment.speakerLabel,
      readerLabel: assignment.readerLabel,
    })
    setAssignPartOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={event.name}
        titleBadge={
          event.status === EventStatus.Draft && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <FileText className="size-3" />
              {m.programs_event_draft_badge()}
            </Badge>
          )
        }
        subtitle={`${dateStr} — ${startTime} - ${endTime}`}
        breadcrumbs={[{ label: m.sidebar_programs(), to: '/programs' }, { label: event.name }]}
        backTo="/programs"
        actions={
          canEdit && (
            <div className="flex gap-2">
              <ReleaseToggleButton status={event.status} eventId={event.id} />
              <Button variant="outline" size="sm" asChild>
                <Link to="./edit">
                  <Pencil className="size-4" />
                  {m.common_edit()}
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild className="text-destructive focus:text-destructive">
                    <Link to="./delete">
                      <Trash2 className="size-4" />
                      {m.common_delete()}
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        }
      />

      {/* Spiritual program */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.programs_view_spiritual_program()}</CardTitle>
          <CardAction>
            <Badge variant="outline">
              {m.programs_view_assigned_count({
                count: String(partAssignedCount),
                total: String(event.eventParts.length),
              })}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.programs_view_part_col()}</TableHead>
                {hasAnyTopic && <TableHead>{m.programs_view_topic_col()}</TableHead>}
                <TableHead className="w-24">{m.programs_view_duration_col()}</TableHead>
                <TableHead>{m.programs_view_speaker_col()}</TableHead>
                <TableHead>{m.programs_view_reader_col()}</TableHead>
                {canEdit && <TableHead className="w-20">{m.common_actions()}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {partsBySection.map(group => {
                const hasMultipleTracks = group.tracks.length > 1 || group.tracks[0]?.track !== ''
                return (
                  <>
                    {group.section && (
                      <TableRow key={`section-${group.section}`} className="bg-muted/50">
                        <TableCell colSpan={colCount} className="py-1.5">
                          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                            {group.section}
                          </span>
                        </TableCell>
                      </TableRow>
                    )}
                    {group.tracks.map(trackGroup => (
                      <>
                        {hasMultipleTracks && trackGroup.track && (
                          <TableRow key={`track-${group.section}-${trackGroup.track}`} className="bg-muted/30">
                            <TableCell colSpan={colCount} className="py-1 pl-8">
                              <span className="text-muted-foreground text-xs italic">{trackGroup.track}</span>
                            </TableCell>
                          </TableRow>
                        )}
                        {trackGroup.eventParts.map(assignment => (
                          <PartRow
                            key={assignment.id}
                            assignment={assignment}
                            canEdit={canEdit}
                            hasAnyTopic={hasAnyTopic}
                            shareText={shareTexts[assignment.id]}
                            openPartAssign={openPartAssign}
                            setUnassignTarget={setUnassignTarget}
                          />
                        ))}
                      </>
                    ))}
                  </>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Services */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.programs_view_services()}</CardTitle>
          <CardAction>
            <Badge variant="outline">
              {m.programs_view_assigned_count({
                count: String(serviceAssignedCount),
                total: String(event.eventServiceParts.length),
              })}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.programs_view_role_col()}</TableHead>
                <TableHead>{m.programs_view_publisher_col()}</TableHead>
                {canEdit && <TableHead className="w-20">{m.common_actions()}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {event.eventServiceParts.map(assignment => (
                <TableRow key={assignment.id}>
                  <TableCell className="font-medium text-sm">{assignment.name}</TableCell>
                  <TableCell
                    className={canEdit ? 'cursor-pointer hover:bg-muted/50' : ''}
                    onClick={
                      canEdit
                        ? () => {
                            setAssignServiceTarget({
                              id: assignment.id,
                              name: assignment.name,
                              assigneeId: assignment.assigneeId,
                            })
                            setAssignServiceOpen(true)
                          }
                        : undefined
                    }
                  >
                    <AssigneeCell
                      assignee={assignment.assignee}
                      externalSpeaker={null}
                      hasConflict={assignment.hasConflict}
                    />
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => {
                            setAssignServiceTarget({
                              id: assignment.id,
                              name: assignment.name,
                              assigneeId: assignment.assigneeId,
                            })
                            setAssignServiceOpen(true)
                          }}
                        >
                          <UserPlus className="size-3" />
                        </Button>
                        {assignment.assigneeId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:text-destructive"
                            onClick={() =>
                              setUnassignTarget({
                                type: 'service',
                                id: assignment.id,
                                name: assignment.name,
                                assigneeName:
                                  `${assignment.assignee?.firstname ?? ''} ${assignment.assignee?.lastname ?? ''}`.trim(),
                              })
                            }
                          >
                            <X className="size-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Assignment Sheets */}
      <AssignPartSheet
        open={assignPartOpen}
        onOpenChange={setAssignPartOpen}
        assignment={assignPartTarget}
        speakerCandidates={
          assignPartTarget
            ? (partCandidates[assignPartTarget.id]?.speakerIds ?? [])
                .map(id => userById.get(id))
                .filter((u): u is (typeof users)[number] => u != null)
            : []
        }
        readerCandidates={
          assignPartTarget
            ? (partCandidates[assignPartTarget.id]?.readerIds ?? [])
                .map(id => userById.get(id))
                .filter((u): u is (typeof users)[number] => u != null)
            : []
        }
        externalSpeakers={externalSpeakers}
        eventId={event.id}
      />

      <AssignServiceSheet
        open={assignServiceOpen}
        onOpenChange={setAssignServiceOpen}
        assignment={assignServiceTarget}
        assigneeCandidates={
          assignServiceTarget
            ? (serviceCandidates[assignServiceTarget.id] ?? [])
                .map(id => userById.get(id))
                .filter((u): u is (typeof users)[number] => u != null)
            : []
        }
        eventId={event.id}
      />

      {/* Unassign confirmation */}
      <UnassignConfirmDialog
        open={unassignTarget != null}
        onOpenChange={open => {
          if (!open) setUnassignTarget(null)
        }}
        target={unassignTarget}
        eventId={event.id}
      />
    </div>
  )
}

function PartRow({
  assignment,
  canEdit,
  hasAnyTopic,
  shareText,
  openPartAssign,
  setUnassignTarget,
}: {
  assignment: PartRowAssignment
  canEdit: boolean
  hasAnyTopic: boolean
  /** Absent when there is nothing to send — see buildAssignmentShareText. */
  shareText?: string
  openPartAssign: (assignment: PartRowAssignment) => void
  setUnassignTarget: (
    target: { type: 'part' | 'service'; id: number; name: string; assigneeName: string } | null,
  ) => void
}) {
  return (
    <TableRow>
      <TableCell>
        <span className="font-medium text-sm">{assignment.name}</span>
      </TableCell>
      {hasAnyTopic && <TableCell className="text-sm">{assignment.topic || '—'}</TableCell>}
      <TableCell>
        {assignment.durationMin ? (
          <span className="flex items-center gap-1 text-muted-foreground text-sm">
            <Clock className="size-3" />
            {assignment.durationMin} min
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>
      <TableCell
        className={canEdit ? 'cursor-pointer hover:bg-muted/50' : ''}
        onClick={canEdit ? () => openPartAssign(assignment) : undefined}
      >
        <AssigneeCell
          assignee={assignment.assignee}
          externalSpeaker={assignment.externalSpeaker}
          hasConflict={assignment.hasConflict}
        />
      </TableCell>
      <TableCell
        className={canEdit ? 'cursor-pointer hover:bg-muted/50' : ''}
        onClick={canEdit ? () => openPartAssign(assignment) : undefined}
      >
        {assignment.assistant ? (
          <span className="text-sm">
            {assignment.assistant.firstname} {assignment.assistant.lastname}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>
      {canEdit && (
        <TableCell>
          <div className="flex gap-1">
            {shareText && (
              <ShareAssignmentButton
                text={shareText}
                label={m.programs_share_button_label({
                  name:
                    assignment.externalSpeaker?.name ??
                    `${assignment.assignee?.firstname ?? ''} ${assignment.assignee?.lastname ?? ''}`.trim(),
                })}
              />
            )}
            <Button variant="ghost" size="icon" className="size-7" onClick={() => openPartAssign(assignment)}>
              <UserPlus className="size-3" />
            </Button>
            {(assignment.assigneeId ?? assignment.externalSpeakerId) && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-destructive hover:text-destructive"
                onClick={() =>
                  setUnassignTarget({
                    type: 'part',
                    id: assignment.id,
                    name: assignment.name,
                    assigneeName:
                      assignment.externalSpeaker?.name ??
                      `${assignment.assignee?.firstname ?? ''} ${assignment.assignee?.lastname ?? ''}`.trim(),
                  })
                }
              >
                <X className="size-3" />
              </Button>
            )}
          </div>
        </TableCell>
      )}
    </TableRow>
  )
}

function ReleaseToggleButton({ status, eventId }: { status: string; eventId: number }) {
  const fetcher = useFetcher<{ ok: boolean }>()
  const isDraft = status === EventStatus.Draft
  const action = isDraft ? `/programs/events/${eventId}/release` : `/programs/events/${eventId}/unrelease`
  const label = isDraft ? m.programs_event_release_button() : m.programs_event_unrelease_button()
  const Icon = isDraft ? Send : FileText
  const inFlight = fetcher.state !== 'idle'

  function submit() {
    fetcher.submit({}, { method: 'POST', action })
  }

  return (
    <Button variant={isDraft ? 'default' : 'outline'} size="sm" onClick={submit} disabled={inFlight}>
      {inFlight ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      {label}
    </Button>
  )
}

function AssigneeCell({
  assignee,
  externalSpeaker,
  hasConflict,
}: {
  assignee: { firstname: string | null; lastname: string | null } | null
  externalSpeaker: { name: string } | null
  hasConflict: boolean
}) {
  if (externalSpeaker) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm">{externalSpeaker.name}</span>
        <Badge variant="secondary" className="text-xs">
          {m.programs_view_external_badge()}
        </Badge>
      </div>
    )
  }

  if (!assignee) {
    return <span className="text-muted-foreground text-sm italic">{m.programs_view_unassigned()}</span>
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">
        {assignee.firstname} {assignee.lastname}
      </span>
      {hasConflict && (
        <Badge variant="destructive" className="gap-1 text-xs">
          <AlertTriangle className="size-3" />
          {m.programs_view_absence_badge()}
        </Badge>
      )}
    </div>
  )
}
