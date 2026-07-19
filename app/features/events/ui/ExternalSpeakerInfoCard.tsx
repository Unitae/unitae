import { AlertTriangle, Clock, Mail, Phone, StickyNote, User } from 'lucide-react'
import { useEffect } from 'react'
import { useFetcher } from 'react-router'
import type { CadencePayload } from '~/features/events/model/cadence.type'
import { CadencePanel } from '~/features/events/ui/CadencePanel'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Skeleton } from '~/shared/ui/skeleton'

interface ExternalSpeakerInfoData {
  profile: {
    id: number
    name: string
    congregationName: string
    phone: string | null
    email: string | null
    notes: string | null
    isIncomplete: boolean
  }
  recentHistory: { date: string; partName: string; topic: string }[]
  cadence: CadencePayload
}

interface ExternalSpeakerInfoCardProps {
  eventId: number
  externalSpeakerId: string | null
  // Points the loader at the part assignment the sheet is editing. Doubles as
  // the source for the cadence anchor (server reads name / section).
  excludePartAssignmentId?: number | null
}

export function ExternalSpeakerInfoCard({
  eventId,
  externalSpeakerId,
  excludePartAssignmentId,
}: ExternalSpeakerInfoCardProps) {
  const fetcher = useFetcher<ExternalSpeakerInfoData>()

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetcher.load is stable, adding it causes infinite loop
  useEffect(() => {
    if (!externalSpeakerId || externalSpeakerId === 'none') return
    const searchParams = new URLSearchParams({ externalSpeakerId })
    if (excludePartAssignmentId != null) searchParams.set('excludePartAssignmentId', String(excludePartAssignmentId))
    fetcher.load(`/programs/events/${eventId}/external-speaker-info?${searchParams}`)
  }, [externalSpeakerId, eventId, excludePartAssignmentId])

  if (!externalSpeakerId || externalSpeakerId === 'none') return null

  if (fetcher.state === 'loading') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <Skeleton className="h-5 w-32" />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    )
  }

  const data = fetcher.data
  if (!data?.profile) return null

  const { profile, recentHistory, cadence } = data

  return (
    <Card className={profile.isIncomplete ? 'border-amber-500/50' : ''}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <User className="size-4" />
          {profile.name}
        </CardTitle>
        {profile.congregationName ? <p className="text-muted-foreground text-sm">{profile.congregationName}</p> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {profile.isIncomplete && (
          <div className="flex items-center gap-1.5 font-medium text-amber-600 text-sm dark:text-amber-400">
            <AlertTriangle className="size-4" />
            {m.external_speaker_info_to_complete()}
          </div>
        )}

        {(profile.phone || profile.email) && (
          <div className="flex flex-col gap-1.5">
            {profile.phone && (
              <a
                href={`tel:${profile.phone}`}
                className="flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
              >
                <Phone className="size-4" />
                {profile.phone}
              </a>
            )}
            {profile.email && (
              <a
                href={`mailto:${profile.email}`}
                className="flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
              >
                <Mail className="size-4" />
                {profile.email}
              </a>
            )}
          </div>
        )}

        {profile.notes && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 font-medium text-muted-foreground text-sm">
              <StickyNote className="size-4" />
              {m.external_speakers_field_notes()}
            </div>
            <p className="text-muted-foreground text-xs">{profile.notes}</p>
          </div>
        )}

        {recentHistory.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 font-medium text-muted-foreground text-sm">
              <Clock className="size-4" />
              {m.publisher_info_recent_history()}
            </div>
            {recentHistory.map(h => (
              <p key={h.date} className="text-muted-foreground text-xs">
                {new Date(h.date).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                {h.topic ? ` — ${h.topic}` : ''}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs italic">{m.external_speakers_first_invitation()}</p>
        )}

        {cadence.anchored && <CadencePanel cadence={cadence} />}
      </CardContent>
    </Card>
  )
}
