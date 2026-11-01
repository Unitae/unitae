import { Link } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'

// Date-only values stored at UTC midnight: shown as that calendar day.
function formatDay(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    date,
  )
}

/**
 * On a publisher's record: when they arrived in the congregation and their last pastoral visit,
 * with a link to record one for those allowed (publisher managers, the member's group overseer and
 * assistant), like the emergency information.
 */
export function PastoralFollowUpCard({
  publisherId,
  arrivedAt,
  lastPastoralVisitAt,
  canRecord,
}: {
  publisherId: number
  arrivedAt: Date | null
  lastPastoralVisitAt: Date | null
  canRecord: boolean
}) {
  const locale = getLocale()
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{m.publishers_visit_section_title()}</CardTitle>
        {canRecord && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/publishers/${publisherId}/pastoral-visit`}>{m.publishers_visit_edit_link()}</Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {arrivedAt && (
          <p className="text-muted-foreground">
            {m.publishers_form_arrived_at()} :{' '}
            <span className="font-medium text-foreground">{formatDay(arrivedAt, locale)}</span>
          </p>
        )}
        <p>
          {lastPastoralVisitAt
            ? m.publishers_visit_last({ date: formatDay(lastPastoralVisitAt, locale) })
            : m.publishers_visit_none()}
        </p>
      </CardContent>
    </Card>
  )
}
