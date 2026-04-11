import type { Building, Prisma } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/libs/db.server'

export function setBuildingProspectionData(
  db: TransactionClient,
  buildingId: number,
  formData: FormData,
): Promise<Building> {
  const data: Prisma.BuildingUpdateInput = {}

  data.homes = formData.get('homes') ? Number(formData.get('homes')) : null
  data.phones = formData.get('phones') ? Number(formData.get('phones')) : null
  data.liberals = formData.get('liberals') ? Number(formData.get('liberals')) : null
  data.hasShops = Boolean(formData.get('shops'))
  data.shopKind = formData.get('shopkinds') ? String(formData.get('shopkinds')) : ''
  data.hasCampus = Boolean(formData.get('campus'))
  data.hasHotel = Boolean(formData.get('hotel'))
  data.hasLandromat = Boolean(formData.get('landromat'))
  data.entrance = {
    update: {
      access: formData.get('access') ? Number(formData.get('access')) : null,
      // biome-ignore lint/style/useNamingConvention: Name of the table in database
      isPMR: Boolean(formData.get('pmr')),
      isOpenEarly: Boolean(formData.get('doors')),
      isMailboxOpen: Boolean(formData.get('mailboxes')),
    },
  }

  const prospectionDate = formData.get('prospection-date')
  data.prospectionDate = prospectionDate ? new Date(prospectionDate.toString()) : null

  return db.building.update({
    where: {
      id: buildingId,
    },
    data,
  })
}
