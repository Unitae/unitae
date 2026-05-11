import { NavLink, Outlet } from 'react-router'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { getZips } from '~/features/territories/server/buildings.server'
import TerritoryFilters from '~/features/territories/ui/TerritoryFilters'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { Permission } from '~/shared/types/permission'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.split_tool_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesManager)

  const { congregationId } = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    const phoneTypeActive = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)
    const prospectedBuilding = { active: true, congregationId, NOT: { prospectionDate: null } } as const
    const totalBuildingsForDoors = await db.building.count({
      where: {
        ...prospectedBuilding,
        entrances: { some: { territories: { none: { type: TerritoryKind.Classical } } } },
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
            OR: [{ phones: { gt: 0 } }, { access: 4, isOpenEarly: false }],
          },
        },
      },
    })
    const totalBuildingsForCommerce = await db.buildingEntrance.count({
      where: {
        kind: EntranceKind.Commerce,
        congregationId,
        buildings: { some: prospectedBuilding },
        territories: { none: { type: TerritoryKind.Commerces } },
      },
    })
    const totalBuildingsForCampus = await db.buildingEntrance.count({
      where: {
        kind: EntranceKind.Campus,
        congregationId,
        buildings: { some: prospectedBuilding },
        territories: { none: { type: TerritoryKind.Univ } },
      },
    })
    const totalBuildingsForHotel = await db.buildingEntrance.count({
      where: {
        kind: EntranceKind.Hotel,
        congregationId,
        buildings: { some: prospectedBuilding },
        territories: { none: { type: TerritoryKind.Hotel } },
      },
    })

    const zips = await getZips(db, congregationId)

    return {
      zips,
      stats: {
        classical: totalBuildingsForDoors,
        hotel: totalBuildingsForHotel,
        campus: totalBuildingsForCampus,
        phones: totalBuildingsForPhone,
        commerce: totalBuildingsForCommerce,
      },
      phoneTypeActive,
    }
  })
}

export default function BuildingListPage({ loaderData }: Route.ComponentProps) {
  const { stats, phoneTypeActive, zips } = loaderData

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title={m.split_tool_title()}
        subtitle={m.split_tool_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_prospection(), to: '/territories/buildings' },
          { label: m.split_tool_title() },
        ]}
        backTo="/territories/buildings"
      />

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
