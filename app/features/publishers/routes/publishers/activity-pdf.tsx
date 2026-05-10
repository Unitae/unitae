import { redirect } from 'react-router'
import { getPublisherById } from '~/features/publishers/server/publishers.server'
import { PublisherActivityDocument } from '~/features/publishers/ui/PublisherActivityDocument'
import { permissionsContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import logger from '~/shared/infra/logger.server'
import { renderPdfResponse, sanitizeFilename } from '~/shared/infra/pdf.server'
import type { CongregationId, MemberId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/activity-pdf'

function computeServiceYearStart(): number {
  const today = new Date()
  const cutoff = new Date(today.getFullYear(), 8, 1)
  return today < cutoff ? today.getFullYear() - 1 : today.getFullYear()
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.ActivityManager)) {
    logger.warn(
      `Tried to download publisher S-21. User ID: ${currentUser.id}. Does NOT have rights to manage activity.`,
    )
    throw redirect('/')
  }

  const publisherId = requireParamId<MemberId>(params.publisherId, '/publishers')

  return withScopeFromContext(context, async db => {
    const publisher = await getPublisherById(
      db,
      publisherId,
      currentUser.congregationId as CongregationId,
      computeServiceYearStart(),
    )

    if (!publisher) throw new NotFoundError('publisher', publisherId)

    const filename = `S-21_F-${sanitizeFilename(publisher.firstname)}-${sanitizeFilename(publisher.lastname)}.pdf`

    return renderPdfResponse(<PublisherActivityDocument publisher={publisher} />, filename)
  })
}
