import { redirect } from 'react-router'
import { toServiceYear } from '~/features/publishers/model/pioneer-pace'
import { getPublisherById } from '~/features/publishers/server/publishers.server'
import { PublisherActivityDocument } from '~/features/publishers/ui/PublisherActivityDocument'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import logger from '~/shared/infra/logger.server'
import { renderPdfResponse, sanitizeFilename } from '~/shared/infra/pdf.server'
import type { CongregationId, MemberId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'
import { zonedNow } from '~/shared/utils/zoned-now'

import type { Route } from './+types/activity-pdf'

const SERVICE_YEAR_RE = /^\d{4}$/

// `?year=` is the start year of the service year to print (2024 for 2024-2025). Absent, the
// current service year in the congregation's timezone. Present but malformed is refused rather
// than swapped for the current year: the sheet is filed as an official record, so a typo in a
// hand-edited URL must not print a different year than the one asked for.
function resolveServiceYear(request: Request, timezone: string, backTo: string): number {
  const requested = new URL(request.url).searchParams.get('year')
  if (requested == null || requested === '') {
    const now = zonedNow(timezone)
    return toServiceYear(now.getMonth(), now.getFullYear())
  }
  if (!SERVICE_YEAR_RE.test(requested)) {
    logger.warn(`Refused S-21 download for malformed service year "${requested}".`)
    throw redirect(backTo)
  }
  return Number(requested)
}

export function loader({ params, request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.CanRecordActivity)) {
    logger.warn(
      `Tried to download publisher S-21. User ID: ${currentUser.id}. Does NOT have rights to manage activity.`,
    )
    throw redirect('/')
  }

  const publisherId = requireParamId<MemberId>(params.publisherId, '/publishers')
  const serviceYear = resolveServiceYear(
    request,
    context.get(congregationContext).timezone,
    `/publishers/${publisherId}/view`,
  )

  return withScopeFromContext(context, async db => {
    const publisher = await getPublisherById(db, publisherId, currentUser.congregationId as CongregationId, serviceYear)

    if (!publisher) throw new NotFoundError('publisher', publisherId)

    const filename = `S-21_F-${sanitizeFilename(publisher.firstname)}-${sanitizeFilename(publisher.lastname)}-${serviceYear}.pdf`

    return renderPdfResponse(<PublisherActivityDocument publisher={publisher} serviceYear={serviceYear} />, filename)
  })
}
