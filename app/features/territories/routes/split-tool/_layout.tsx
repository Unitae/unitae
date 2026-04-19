import { data, NavLink, Outlet, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/shared/types/role'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { getZips } from '~/features/territories/server/buildings.server'
import TerritoryFilters from '~/features/territories/ui/TerritoryFilters'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/infra/db.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.split_tool_meta_title() }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session, can, congregationId } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const phoneTypeActive = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)
    // biome-ignore lint/style/useNamingConvention: prisma keywords
    const prospectedBuilding = { active: true, congregationId, NOT: { prospectionDate: null } } as const
    const totalBuildingsForDoors = await db.building.count({
      where: {
        ...prospectedBuilding,
        entrances: { some: { territories: { none: { type: TerritoryKind.Classical } } } },
        // biome-ignore lint/style/useNamingConvention: prisma keywords
        OR: [
          { entrances: { some: { access: 1 } } }, // interphone
          { entrances: { some: { access: 2 } } }, // sonnette
          phoneTypeActive
            ? { entrances: { some: { access: 4, isOpenEarly: true } } }
            : { entrances: { some: { access: 4 } } }, // code
        ],
      },
    })
    const totalBuildingsForPhone = await db.building.count({
      where: {
        ...prospectedBuilding,
        entrances: {
          some: {
            territories: { none: { type: TerritoryKind.Classical } },
            // biome-ignore lint/style/useNamingConvention: prisma keywords
            OR: [{ phones: { gt: 0 } }, { access: 4, isOpenEarly: false }],
          },
        },
      },
    })
    const totalBuildingsForCommerce = await db.buildingEntrance.count({
      where: {
        kind: 'commerce',
        congregationId,
        buildings: { some: prospectedBuilding },
        territories: { none: { type: TerritoryKind.Commerces } },
      },
    })
    const totalBuildingsForCampus = await db.buildingEntrance.count({
      where: {
        kind: 'campus',
        congregationId,
        buildings: { some: prospectedBuilding },
        territories: { none: { type: TerritoryKind.Univ } },
      },
    })
    const totalBuildingsForHotel = await db.buildingEntrance.count({
      where: {
        kind: 'hotel',
        congregationId,
        buildings: { some: prospectedBuilding },
        territories: { none: { type: TerritoryKind.Hotel } },
      },
    })

    const messages = { success: session.get('success'), error: session.get('error') }
    const zips = await getZips(db, congregationId)

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
  })
}

export default function BuildingListPage({ loaderData }: Route.ComponentProps) {
  const { messages, stats, phoneTypeActive, zips } = loaderData

  return (
    <div className="flex flex-col gap-7">
      <AlertMessages messages={messages} />

      <PageHeader title={m.split_tool_title()} subtitle={m.split_tool_subtitle()} />

      <div className="flex flex-wrap justify-around gap-3 rounded-lg border bg-muted/50 p-2">
        <NavLink
          to={'.'}
          className={({ isActive }) =>
            isActive
              ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-background p-4 text-center shadow-sm'
              : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-muted-foreground hover:text-foreground'
          }
          title={m.split_tool_classical_title()}
          caseSensitive
          end
        >
          <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.classical.toLocaleString()}</span>
          <span className="text-sm">
            {m.split_tool_classical_label_line1()} <br /> {m.split_tool_classical_label_line2()}
          </span>
        </NavLink>
        <NavLink
          to={'./commerces'}
          className={({ isActive }) =>
            isActive
              ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-background p-4 text-center shadow-sm'
              : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-muted-foreground hover:text-foreground'
          }
          title={m.split_tool_commerces_title()}
          end
        >
          <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.commerce.toLocaleString()}</span>
          <span className="text-sm">
            {m.split_tool_commerces_label_line1()} <br /> {m.split_tool_commerces_label_line2()}
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
            title={m.split_tool_phones_title()}
            end
          >
            <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.phones.toLocaleString()}</span>
            <span className="text-sm">
              {m.split_tool_phones_label_line1()} <br /> {m.split_tool_phones_label_line2()}
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
          title={m.split_tool_campus_title()}
          end
        >
          <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.campus.toLocaleString()}</span>
          <span className="text-sm">
            {m.split_tool_campus_label_line1()} <br /> {m.split_tool_campus_label_line2()}
          </span>
        </NavLink>
        <NavLink
          to="./hotels"
          className={({ isActive }) =>
            isActive
              ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-background p-4 text-center shadow-sm'
              : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-muted-foreground hover:text-foreground'
          }
          title={m.split_tool_hotels_title()}
          end
        >
          <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.hotel.toLocaleString()}</span>
          <span className="text-sm">
            {m.split_tool_hotels_label_line1()} <br /> {m.split_tool_hotels_label_line2()}
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
