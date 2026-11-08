import { Fragment } from 'react'
import { Link } from 'react-router'
import type { Territory } from '~/database/generated/client'
import type { DetailedBuilding } from '~/features/territories/model/detailed-building.type'
import { uniqueTerritories } from '~/features/territories/model/unique-territories'
import * as m from '~/i18n/paraglide/messages'

function counted(count: number, one: (args: { count: string }) => string, many: (args: { count: string }) => string) {
  return (count < 2 ? one : many)({ count: String(count) })
}

/**
 * The facts under a building's title, each shown only when the database has it: its territories (linked for
 * those who may open them), its own households and phones, and how many entrances it has.
 */
export function BuildingMeta({
  building,
  canViewTerritories,
}: {
  building: DetailedBuilding
  canViewTerritories: boolean
}) {
  const homes = building.residentialData?.homes
  const phones = building.residentialData?.phones
  const figures = [
    homes != null ? counted(homes, m.building_header_homes_one, m.building_header_homes_many) : null,
    phones != null ? counted(phones, m.building_header_phones_one, m.building_header_phones_many) : null,
  ].filter(Boolean)

  return (
    <>
      <BuildingTerritories building={building} canViewTerritories={canViewTerritories} />
      {figures.length > 0 && <span className="tabular-nums">{figures.join(' · ')}</span>}
      {building.entrances.length > 0 && (
        <span>
          {counted(building.entrances.length, m.building_header_entrances_one, m.building_header_entrances_many)}
        </span>
      )}
    </>
  )
}

/** « Territoire T05 »: the territories of the building's entrances, linked for those who may open them. */
export function BuildingTerritories({
  building,
  canViewTerritories,
}: {
  building: { entrances: { territories: Territory[] }[] }
  canViewTerritories: boolean
}) {
  const territories = uniqueTerritories(building.entrances)
  if (territories.length === 0) return null
  return (
    <span>
      {territories.length === 1 ? m.building_header_territory() : m.building_header_territories()}{' '}
      {territories.map((territory, index) => (
        <Fragment key={territory.id}>
          {index > 0 && ', '}
          {canViewTerritories ? (
            <Link
              to={`/territories/territory/${territory.id}/view`}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              {territory.number}
            </Link>
          ) : (
            <span className="text-foreground">{territory.number}</span>
          )}
        </Fragment>
      ))}
    </span>
  )
}
