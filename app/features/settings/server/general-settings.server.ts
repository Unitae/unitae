import { unscopedDb } from '~/shared/infra/db.server'

export async function updateGeneralSettings(
  congregationId: number,
  data: {
    displayName: string | null
    locale: string
    domain: string | null
  },
) {
  await unscopedDb.congregation.update({
    where: { id: congregationId },
    data: {
      displayName: data.displayName || null,
      locale: data.locale,
      domain: data.domain,
    },
  })
}
