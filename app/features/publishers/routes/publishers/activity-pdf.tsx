import { redirect } from 'react-router'
import { sanitizeUser } from '~/shared/auth/sanitize-user.server'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import logger from '~/shared/infra/logger.server'
import { renderPdfResponse } from '~/shared/infra/pdf.server'
import { Role } from '~/shared/types/role'
import { requireParamId } from '~/shared/utils/params.server'
import { PublisherActivityDocument } from '~/features/publishers/ui/PublisherActivityDocument'

import type { Route } from './+types/activity-pdf'

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)

  if (!permissions.has(Role.ActivityManager)) {
    logger.warn(`Tried to download publisher S-21. User ID: ${currentUser.id}. Does NOT have rights to manage activity.`)
    throw redirect('/')
  }

  const publisherId = requireParamId(params.publisherId, '/publishers')

  return withScopeFromContext(context, async db => {
    const today = new Date()
    const yearBegining = new Date(today.getFullYear(), 8, 1)
    if (today < yearBegining) {
      yearBegining.setFullYear(today.getFullYear() - 1)
    }

    const publisher = await db.user.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
        id_congregationId: { id: publisherId, congregationId: currentUser.congregationId },
      },
      include: {
        activities: {
          where: {
            // biome-ignore lint/style/useNamingConvention: Prisma syntax
            OR: [
              { year: yearBegining.getFullYear(), month: { gte: 8 } },
              { year: yearBegining.getFullYear() + 1, month: { lte: 11 } },
            ],
          },
        },
      },
    })

    if (!publisher) throw new NotFoundError('publisher', publisherId)

    const sanitized = sanitizeUser(publisher)
    const filename = `S-21_F-${publisher.firstname}-${publisher.lastname}.pdf`

    return renderPdfResponse(<PublisherActivityDocument publisher={sanitized} />, filename)
  })
}
