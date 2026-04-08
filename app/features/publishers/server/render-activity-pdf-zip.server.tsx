import { pdf } from '@react-pdf/renderer'
import JsZip from 'jszip'
import { sanitizeUser } from '~/features/authentication/server/sanitize-user.server'
import { PublisherActivityDocument } from '~/features/publishers/ui/PublisherActivityDocument'
import { db } from '~/shared/libs/db.server'

export async function renderActivityPdfZip(year: number) {
  const yearBegining = new Date(year, 0, 1)
  const users = await db.user.findMany({
    where: {
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
                lte: 11,
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
                lte: 11,
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
  for (const user of users) {
    const publisher = sanitizeUser(user)
    const buffer = await pdf(<PublisherActivityDocument publisher={publisher} />).toBuffer()
    zip.file(`${user.firstname}-${user.lastname}.pdf`, buffer)
  }

  return zip.generateAsync({ type: 'arraybuffer' })
}
