import { AlertTriangle, Calendar, Clock, Info, User } from 'lucide-react'
import { useEffect } from 'react'
import { useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Skeleton } from '~/shared/ui/skeleton'
import { formatPersonName } from '~/shared/utils/format-person-name'

interface PublisherInfoData {
  profile: {
    id: number
    firstname: string | null
    lastname: string | null
    isHelder: boolean
    isServant: boolean
    type: string
    group: string | null
  }
  daysOff: { startDate: string; endDate: string }[]
  sameEventAssignments: { type: 'part' | 'service'; name: string; section?: string }[]
  recentHistory: { date: string }[]
}

interface PublisherInfoCardProps {
  eventId: number
  userId: string | null
  partName?: string
  // Used by the assign sheets to drop the assignment being edited from the
  // "other assignments on the same event" panel — otherwise the picker's own
  // row shows up as a fake conflict.
  excludePartAssignmentId?: number | null
  excludeServiceAssignmentId?: number | null
}

export function PublisherInfoCard({
  eventId,
  userId,
  partName,
  excludePartAssignmentId,
  excludeServiceAssignmentId,
}: PublisherInfoCardProps) {
  const fetcher = useFetcher<PublisherInfoData>()

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetcher.load is stable, adding it causes infinite loop
  useEffect(() => {
    if (!userId || userId === 'none') return
    const searchParams = new URLSearchParams({ userId })
    if (partName) searchParams.set('partName', partName)
    if (excludePartAssignmentId != null) searchParams.set('excludePartAssignmentId', String(excludePartAssignmentId))
    if (excludeServiceAssignmentId != null) {
      searchParams.set('excludeServiceAssignmentId', String(excludeServiceAssignmentId))
    }
    fetcher.load(`/programs/events/${eventId}/publisher-info?${searchParams}`)
  }, [userId, eventId, partName, excludePartAssignmentId, excludeServiceAssignmentId])

  if (!userId || userId === 'none') return null

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

  const { profile, daysOff, sameEventAssignments, recentHistory } = data
  const hasDaysOff = daysOff.length > 0
  const hasOtherAssignments = sameEventAssignments.length > 0

  return (
    <Card className={hasDaysOff ? 'border-destructive/50' : ''}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <User className="size-4" />
          {formatPersonName(profile)}
        </CardTitle>
        <div className="flex flex-wrap gap-1.5">
          {profile.isHelder && <Badge variant="secondary">{m.publisher_info_elder_badge()}</Badge>}
          {profile.isServant && <Badge variant="secondary">{m.publisher_info_servant_badge()}</Badge>}
          {profile.group && (
            <Badge variant="outline" className="text-xs">
              {profile.group}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {hasDaysOff && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 font-medium text-destructive text-sm">
              <AlertTriangle className="size-4" />
              {m.publisher_info_absence_during_event()}
            </div>
            {daysOff.map(d => (
              <p key={d.startDate} className="text-muted-foreground text-xs">
                Du {new Date(d.startDate).toLocaleDateString('fr-FR')} au{' '}
                {new Date(d.endDate).toLocaleDateString('fr-FR')}
              </p>
            ))}
          </div>
        )}

        {hasOtherAssignments && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 font-medium text-orange-600 text-sm dark:text-orange-400">
              <Info className="size-4" />
              {m.publisher_info_already_assigned()}
            </div>
            {sameEventAssignments.map(a => (
              <p key={`${a.type}-${a.name}`} className="text-muted-foreground text-xs">
                {a.type === 'part' ? '📖' : '🔧'} {a.name}
                {a.section ? ` (${a.section})` : ''}
              </p>
            ))}
          </div>
        )}

        {!hasDaysOff && !hasOtherAssignments && (
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
            <Calendar className="size-4" />
            {m.publisher_info_available()}
          </div>
        )}

        {recentHistory.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 font-medium text-muted-foreground text-sm">
              <Clock className="size-4" />
              {m.publisher_info_recent_history()}
            </div>
            {recentHistory.map(h => (
              <p key={h.date} className="text-muted-foreground text-xs">
                {new Date(h.date).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            ))}
            {recentHistory.length === 0 && (
              <p className="text-muted-foreground text-xs">{m.publisher_info_first_assignment()}</p>
            )}
          </div>
        )}

        {recentHistory.length === 0 && (
          <p className="text-muted-foreground text-xs italic">{m.publisher_info_no_history()}</p>
        )}
      </CardContent>
    </Card>
  )
}
