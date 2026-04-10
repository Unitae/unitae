import { data, NavLink, Outlet, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { getBoolSetting } from '~/features/settings/server/settings'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { getZips } from '~/features/territories/server/buildings'
import TerritoryFilters from '~/features/territories/ui/TerritoryFilters'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Propection - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session, can, db } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const phoneTypeActive = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive)
  const totalBuildingsForDoors = await db.building.count({
    where: {
      active: true,
      entrance: {
        territories: {
          none: { type: TerritoryKind.Classical },
        },
      },
      // biome-ignore lint/style/useNamingConvention: prisma keywords
      NOT: {
        prospectionDate: null,
      },
      // biome-ignore lint/style/useNamingConvention: prisma keywords
      OR: [
        {
          entrance: {
            access: 1, // interphone
          },
        },
        {
          entrance: {
            access: 2, // sonnette
          },
        },
        phoneTypeActive ? { entrance: { access: 4, isOpenEarly: true } } : { entrance: { access: 4 } }, // code ouvert le matin
      ],
    },
  })
  const totalBuildingsForPhone = await db.building.count({
    where: {
      active: true,
      entrance: {
        territories: {
          none: { type: TerritoryKind.Classical },
        },
      },
      // biome-ignore lint/style/useNamingConvention: prisma keywords
      NOT: {
        prospectionDate: null,
      },
      // biome-ignore lint/style/useNamingConvention: prisma keywords
      OR: [
        {
          phones: {
            gt: 0,
          },
        },
        { entrance: { access: 4, isOpenEarly: false } }, // code ouvert le matin
      ],
    },
  })
  const totalBuildingsForCommerce = await db.building.count({
    where: {
      active: true,
      entrance: {
        territories: {
          none: { type: TerritoryKind.Commerces },
        },
      },
      // biome-ignore lint/style/useNamingConvention: prisma keywords
      NOT: {
        prospectionDate: null,
      },
      hasShops: true,
    },
  })
  const totalBuildingsForCampus = await db.building.count({
    where: {
      active: true,
      entrance: {
        territories: {
          none: { type: TerritoryKind.Univ },
        },
      },
      // biome-ignore lint/style/useNamingConvention: prisma keywords
      NOT: {
        prospectionDate: null,
      },
      hasCampus: true,
    },
  })
  const totalBuildingsForHotel = await db.building.count({
    where: {
      active: true,
      entrance: {
        territories: {
          none: { type: TerritoryKind.Hotel },
        },
      },
      // biome-ignore lint/style/useNamingConvention: prisma keywords
      NOT: {
        prospectionDate: null,
      },
      hasHotel: true,
    },
  })

  const messages = { success: session.get('success'), error: session.get('error') }
  const zips = await getZips(db)

  return data(
    {
      messages,
      zips,
      stats: {
        classical: totalBuildingsForDoors,
        hotel: totalBuildingsForHotel,
        campus: totalBuildingsForCampus,
        phones: totalBuildingsForPhone,
        commerce: totalBuildingsForCommerce,
      },
      phoneTypeActive,
    },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function BuildingListPage({ loaderData }: Route.ComponentProps) {
  const { messages, stats, phoneTypeActive, zips } = loaderData

  return (
    <div className="flex flex-col gap-7">
      <AlertMessages messages={messages} />

      <PageHeader
        title="Découpage des territoires"
        subtitle="Liste des bâtiments du territoire de l'assemblée locale à attribuer à des territoires"
      />

      <div className="flex flex-wrap justify-around gap-3 rounded-lg border bg-muted/50 p-2">
        <NavLink
          to={'.'}
          className={({ isActive }) =>
            isActive
              ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-background p-4 text-center shadow-sm'
              : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-muted-foreground hover:text-foreground'
          }
          title="Batiments disponibles pour du porte à portes"
          caseSensitive
          end
        >
          <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.classical.toLocaleString()}</span>
          <span className="text-sm">
            batiments disponibles <br /> pour le porte à porte
          </span>
        </NavLink>
        <NavLink
          to={'./commerces'}
          className={({ isActive }) =>
            isActive
              ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-background p-4 text-center shadow-sm'
              : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-muted-foreground hover:text-foreground'
          }
          title="Batiments disponibles pour l'activité Commerces"
          end
        >
          <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.commerce.toLocaleString()}</span>
          <span className="text-sm">
            batiments disponibles <br /> avec des commerces
          </span>
        </NavLink>
        {phoneTypeActive && (
          <NavLink
            to={'./phones'}
            className={({ isActive }) =>
              isActive
                ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-background p-4 text-center shadow-sm'
                : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-muted-foreground hover:text-foreground'
            }
            title={'Batiments disponibles avec du téléphone'}
            end
          >
            <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.phones.toLocaleString()}</span>
            <span className="text-sm">
              batiments disponibles <br /> avec du téléphone
            </span>
          </NavLink>
        )}
        <NavLink
          to={'./campus'}
          className={({ isActive }) =>
            isActive
              ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-background p-4 text-center shadow-sm'
              : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-muted-foreground hover:text-foreground'
          }
          title="Batiments disponibles avec des logements pour étudiants"
          end
        >
          <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.campus.toLocaleString()}</span>
          <span className="text-sm">
            batiments disponibles <br /> avec logements pour étudiants
          </span>
        </NavLink>
        <NavLink
          to="./hotels"
          className={({ isActive }) =>
            isActive
              ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-background p-4 text-center shadow-sm'
              : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-muted-foreground hover:text-foreground'
          }
          title="Batiments disponibles avec des hotels"
          end
        >
          <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.hotel.toLocaleString()}</span>
          <span className="text-sm">
            batiments disponibles <br />
            avec des hotels
          </span>
        </NavLink>
      </div>

      <TerritoryFilters zips={zips} showAccess showSearch showZip />

      <div className="flex grow flex-col gap-3">
        <Outlet />
      </div>
    </div>
  )
}
