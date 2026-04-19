import { pdf } from '@react-pdf/renderer'
import JsZip from 'jszip'
import pLimit from 'p-limit'
import { sanitizeUser } from '~/shared/libs/sanitize-user.server'
import { PublisherActivityDocument } from '~/features/publishers/ui/PublisherActivityDocument'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function renderActivityPdfZip(db: TransactionClient, congregationId: number, year: number) {
  const yearBegining = new Date(year, 0, 1)
  const users = await db.user.findMany({
    where: {
      congregationId,
      activities: {
        some: {
          // biome-ignore lint/style/useNamingConvention: Prisma syntax
          OR: [
            {
              year: yearBegining.getFullYear(),
              month: {
                gte: 8,
              },
            },
            {
              year: yearBegining.getFullYear() + 1,
              month: {
                lte: 7,
              },
            },
          ],
        },
      },
    },
    include: {
      publisherGroup: {
        include: {
          responsible: true,
          deputy: true,
        },
      },
      activities: {
        where: {
          // biome-ignore lint/style/useNamingConvention: prisma syntax
          OR: [
            {
              year: yearBegining.getFullYear(),
              month: {
                gte: 8,
              },
            },
            {
              year: yearBegining.getFullYear() + 1,
              month: {
                lte: 7,
              },
            },
          ],
        },
      },
    },
  })

  if (!users) {
    throw new Error('Users not found')
  }

  const zip = new JsZip()
  const limit = pLimit(4)
  await Promise.all(
    users.map(user =>
      limit(async () => {
        const publisher = sanitizeUser(user)
        const buffer = await pdf(<PublisherActivityDocument publisher={publisher} />).toBuffer()
        zip.file(`${user.firstname}-${user.lastname}.pdf`, buffer)
      }),
    ),
  )

  return zip.generateAsync({ type: 'arraybuffer' })
}
