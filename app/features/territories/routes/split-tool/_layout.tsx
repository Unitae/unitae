import { NavLink, Outlet, useSearchParams } from 'react-router'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { countAvailableEntrances, getZips } from '~/features/territories/server/buildings.server'
import { buildTerritoryFilterChips } from '~/features/territories/ui/build-filter-chips'
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
import { FilterChipBar } from '~/shared/ui/filters/FilterChipBar'
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
    const phoneTypeActive =
      (await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)) ?? false
    const ctx = { phoneTypeActive }
    const [classical, phones, commerce, campus, hotel, zips] = await Promise.all([
      countAvailableEntrances(db, congregationId, TerritoryKind.Classical, ctx),
      countAvailableEntrances(db, congregationId, TerritoryKind.Phone, ctx),
      countAvailableEntrances(db, congregationId, TerritoryKind.Commerces, ctx),
      countAvailableEntrances(db, congregationId, TerritoryKind.Univ, ctx),
      countAvailableEntrances(db, congregationId, TerritoryKind.Hotel, ctx),
      getZips(db, congregationId),
    ])

    return {
      zips,
      // Counts reflect entrances (not buildings) that pass `availableForCreateWhere` — the
      // same query the map uses. Any diff between "counted" and "visible on the map" is
      // either "no coordinates" (surfaced via a rail chip per tab) or "off-viewport".
      stats: {
        classical: classical.total,
        hotel: hotel.total,
        campus: campus.total,
        phones: phones.total,
        commerce: commerce.total,
      },
      phoneTypeActive,
    }
  })
}

export default function BuildingListPage({ loaderData }: Route.ComponentProps) {
  const { stats, phoneTypeActive, zips } = loaderData
  const [searchParams] = useSearchParams()
  const chips = buildTerritoryFilterChips(searchParams)

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

      <FilterChipBar chips={chips} />
      <TerritoryFilters zips={zips} showAccess showSearch showZip />

      <div className="flex grow flex-col gap-3">
        <Outlet />
      </div>
    </div>
  )
}
