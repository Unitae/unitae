import { pdf } from '@react-pdf/renderer'
import JsZip from 'jszip'
import pLimit from 'p-limit'
import type { Member, PublisherActivity } from '~/database/generated/client'
import { PublisherActivityDocument } from '~/features/publishers/ui/PublisherActivityDocument'
import type { TransactionClient } from '~/shared/infra/db.server'

type PublisherWithActivities = Member & { activities: PublisherActivity[] }

export interface PublisherScopeOptions {
  groupId?: number
  publisherIds?: number[]
}

export async function getPublishersWithYearActivities(
  db: TransactionClient,
  congregationId: number,
  year: number,
  scope: PublisherScopeOptions = {},
): Promise<PublisherWithActivities[]> {
  const yearFilter = {
    OR: [
      { year, month: { gte: 8 } },
      { year: year + 1, month: { lte: 7 } },
    ],
  }

  return db.member.findMany({
    where: {
      congregationId,
      activities: { some: yearFilter },
      ...(scope.groupId != null ? { publisherGroupId: scope.groupId } : {}),
      ...(scope.publisherIds != null ? { id: { in: scope.publisherIds } } : {}),
    },
    include: {
      activities: { where: yearFilter },
    },
  })
}

export async function buildActivityPdfZip(publishers: PublisherWithActivities[]): Promise<ArrayBuffer> {
  const zip = new JsZip()
  const limit = pLimit(4)
  await Promise.all(
    publishers.map(publisher =>
      limit(async () => {
        const buffer = await pdf(<PublisherActivityDocument publisher={publisher} />).toBuffer()
        zip.file(`${publisher.firstname}-${publisher.lastname}.pdf`, buffer)
      }),
    ),
  )

  return zip.generateAsync({ type: 'arraybuffer' })
}
