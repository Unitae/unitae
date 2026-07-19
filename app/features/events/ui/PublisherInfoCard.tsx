import { AlertTriangle, CheckCircle2, Info, Repeat, User } from 'lucide-react'
import { useEffect } from 'react'
import { useFetcher } from 'react-router'
import type { CadenceEntry, PartSlot } from '~/features/events/model/cadence.type'
import { CadenceStrip } from '~/features/events/ui/CadenceStrip'
import { computeCadenceWarnings } from '~/features/events/ui/compute-cadence-warnings'
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
  cadence: { past: CadenceEntry[]; future: CadenceEntry[] }
}

interface PublisherInfoCardProps {
  eventId: number
  userId: string | null
  // Points the loader at the part/service assignment the sheet is editing.
  // Doubles as the source for the cadence anchor (the loader reads name /
  // section server-side) and the "same-event assignments" exclusion.
  excludePartAssignmentId?: number | null
  excludeServiceAssignmentId?: number | null
  // Which slot the card is rendering for on a part sheet. Ignored for service
  // assignments (they have only one slot). Definition + rotation-bucket
  // rationale live on the PartSlot type in the shared cadence model.
  partSlot?: PartSlot
}

export function PublisherInfoCard({
  eventId,
  userId,
  excludePartAssignmentId,
  excludeServiceAssignmentId,
  partSlot,
}: PublisherInfoCardProps) {
  const fetcher = useFetcher<PublisherInfoData>()

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetcher.load is stable, adding it causes infinite loop
  useEffect(() => {
    if (!userId || userId === 'none') return
    const searchParams = new URLSearchParams({ userId })
    if (excludePartAssignmentId != null) searchParams.set('excludePartAssignmentId', String(excludePartAssignmentId))
    if (excludeServiceAssignmentId != null) {
      searchParams.set('excludeServiceAssignmentId', String(excludeServiceAssignmentId))
    }
    if (partSlot) searchParams.set('partSlot', partSlot)
    fetcher.load(`/programs/events/${eventId}/publisher-info?${searchParams}`)
  }, [userId, eventId, excludePartAssignmentId, excludeServiceAssignmentId, partSlot])

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

  const { profile, daysOff, sameEventAssignments, cadence } = data
  const hasDaysOff = daysOff.length > 0
  const hasOtherAssignments = sameEventAssignments.length > 0
  const hasCadence = cadence.past.length > 0 || cadence.future.length > 0

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
          <div className="flex items-center gap-1.5 font-medium text-green-600 text-sm dark:text-green-400">
            <CheckCircle2 className="size-4" />
            {m.publisher_info_available()}
          </div>
        )}

        {hasCadence && <CadencePanel cadence={cadence} />}
      </CardContent>
    </Card>
  )
}

function CadencePanel({ cadence }: { cadence: { past: CadenceEntry[]; future: CadenceEntry[] } }) {
  const warnings = computeCadenceWarnings(cadence)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 font-medium text-muted-foreground text-sm">
        <Repeat className="size-4" />
        {m.publisher_info_cadence()}
      </div>
      {warnings.firstTime ? (
        <div className="flex items-center gap-1.5 font-medium text-green-600 text-xs dark:text-green-400">
          <CheckCircle2 className="size-3.5" />
          {m.publisher_info_first_time()}
        </div>
      ) : (
        <CadenceStrip past={cadence.past} future={cadence.future} />
      )}
      {warnings.consecutive && (
        <div className="flex items-center gap-1.5 text-orange-600 text-xs dark:text-orange-400">
          <Info className="size-3.5" />
          {m.publisher_info_consecutive()}
        </div>
      )}
      {warnings.rotationConcern && (
        <div className="flex items-center gap-1.5 text-orange-600 text-xs dark:text-orange-400">
          <Info className="size-3.5" />
          {m.publisher_info_rotation_concern({
            n: String(warnings.rotationConcern.assigned),
            m: String(warnings.rotationConcern.window),
          })}
        </div>
      )}
    </div>
  )
}
