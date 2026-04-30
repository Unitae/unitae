import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { BuildingAccess, BuildingEntrance, BuildingResidentialData } from '~/database/generated/client'
import {
  EntranceKind,
  entranceKindLabels as getEntranceKindLabels,
} from '~/features/territories/model/entrance-kind.type'
import { ShopKind } from '~/features/territories/model/shop-kind.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import * as m from '~/paraglide/messages'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

type EntranceWithRelations = BuildingEntrance & {
  accesses: BuildingAccess[]
  residentialData: BuildingResidentialData[]
}

export function ResidentialEntranceCard({
  entrance,
  residentialData,
  isDisabled = false,
  onDelete,
  children,
}: {
  entrance: EntranceWithRelations | undefined
  residentialData: BuildingResidentialData | null
  isDisabled: boolean
  onDelete?: () => void
  children?: React.ReactNode
}) {
  const [access, setAccess] = useState(entrance?.access)
  const disabledStyle = isDisabled ? 'cursor-not-allowed opacity-50' : ''

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {m.prospection_entrance_residential_title()}
            <Badge variant="outline">{m.prospection_entrance_door_to_door_badge()}</Badge>
          </CardTitle>
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onDelete}
              title={m.prospection_entrance_delete_title()}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>{m.prospection_entrance_access_type_label()}</Label>
            <select
              className={`rounded-md border border-input bg-background px-3 py-2 text-sm ${disabledStyle}`}
              name="access"
              value={access ?? ''}
              onChange={e => setAccess(Number(e.target.value))}
              disabled={isDisabled}
            >
              <option>{m.prospection_entrance_access_select_placeholder()}</option>
              <option value={TerritoryAccess.Intercom}>{m.prospection_entrance_access_intercom()}</option>
              <option value={TerritoryAccess.Code}>{m.prospection_entrance_access_digicode()}</option>
              <option value={TerritoryAccess.Doorbell}>{m.prospection_entrance_access_doorbell()}</option>
            </select>
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>{m.prospection_entrance_homes_label()}</Label>
            <Input
              defaultValue={residentialData?.homes ?? ''}
              name="homes"
              type="number"
              disabled={isDisabled}
              className={disabledStyle}
            />
          </div>
        </div>

        {access === TerritoryAccess.Code && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                className={`rounded border border-input ${disabledStyle}`}
                name="doors"
                type="checkbox"
                defaultChecked={entrance?.isOpenEarly ?? false}
                disabled={isDisabled}
              />
              {m.prospection_entrance_doors_open_morning()}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                className={`rounded border border-input ${disabledStyle}`}
                name="mailboxes"
                type="checkbox"
                defaultChecked={entrance?.isMailboxOpen ?? false}
                disabled={isDisabled}
              />
              {m.prospection_entrance_mailboxes_accessible()}
            </label>
          </>
        )}

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>{m.prospection_entrance_phones_label()}</Label>
            <Input
              defaultValue={residentialData?.phones ?? ''}
              name="phones"
              type="number"
              disabled={isDisabled}
              className={disabledStyle}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>{m.prospection_entrance_liberals_label()}</Label>
            <Input
              defaultValue={residentialData?.liberals ?? ''}
              name="liberals"
              type="number"
              disabled={isDisabled}
              className={disabledStyle}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            className={`rounded border border-input ${disabledStyle}`}
            name="pmr"
            type="checkbox"
            defaultChecked={entrance?.isPMR ?? false}
            disabled={isDisabled}
          />
          <span>
            {m.prospection_entrance_pmr_label()}{' '}
            <span className="font-semibold text-primary">{m.prospection_entrance_pmr_highlight()}</span>
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <Label>
            {m.prospection_entrance_notes_label()}{' '}
            <span className="text-muted-foreground text-sm">{m.prospection_entrance_notes_visibility()}</span>
          </Label>
          <textarea
            className={`rounded-md border border-input bg-background px-3 py-2 text-sm ${disabledStyle}`}
            rows={2}
            name="residential-notes"
            defaultValue={entrance?.notes ?? ''}
            disabled={isDisabled}
          />
        </div>

        {children}
      </CardContent>
    </Card>
  )
}

export function CommerceEntranceCard({
  entrance,
  isDisabled = false,
  onDelete,
}: {
  entrance: BuildingEntrance | undefined
  isDisabled: boolean
  onDelete?: () => void
}) {
  const disabledStyle = isDisabled ? 'cursor-not-allowed opacity-50' : ''

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">{getEntranceKindLabels()[EntranceKind.Commerce]}</CardTitle>
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onDelete}
              title={m.prospection_entrance_delete_title()}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>{m.prospection_entrance_commerce_category()}</Label>
          <select
            className={`rounded-md border border-input bg-background px-3 py-2 text-sm ${disabledStyle}`}
            defaultValue={entrance?.shopKind ?? ''}
            name="shopkinds"
            disabled={isDisabled}
            required
          >
            <option>{m.prospection_entrance_commerce_select()}</option>
            <option value={ShopKind.Food}>{m.shop_kind_food()}</option>
            <option value={ShopKind.Clothing}>{m.shop_kind_clothing()}</option>
            <option value={ShopKind.Jewelry}>{m.shop_kind_jewelry()}</option>
            <option value={ShopKind.Health}>{m.shop_kind_health()}</option>
            <option value={ShopKind.Home}>{m.shop_kind_home()}</option>
            <option value={ShopKind.Catering}>{m.shop_kind_catering()}</option>
            <option value={ShopKind.Cosmetics}>{m.shop_kind_cosmetics()}</option>
            <option value={ShopKind.Tech}>{m.shop_kind_tech()}</option>
            <option value={ShopKind.Newspaper}>{m.shop_kind_newspaper()}</option>
            <option value={ShopKind.GasStation}>{m.shop_kind_gas_station()}</option>
            <option value={ShopKind.Other}>{m.shop_kind_other()}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>
            {m.prospection_entrance_notes_label()}{' '}
            <span className="text-muted-foreground text-sm">{m.prospection_entrance_notes_visibility()}</span>
          </Label>
          <textarea
            className={`rounded-md border border-input bg-background px-3 py-2 text-sm ${disabledStyle}`}
            rows={2}
            name="commerce-notes"
            defaultValue={entrance?.notes ?? ''}
            disabled={isDisabled}
          />
        </div>
      </CardContent>
    </Card>
  )
}

export function SimpleEntranceCard({
  kind,
  formName,
  onDelete,
}: {
  kind: EntranceKind
  formName: string
  onDelete?: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">{getEntranceKindLabels()[kind]}</CardTitle>
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onDelete}
              title={m.prospection_entrance_delete_title()}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <input type="hidden" name={formName} value="on" />
        <p className="text-muted-foreground text-sm">
          {m.prospection_entrance_simple_description({ kind: getEntranceKindLabels()[kind].toLowerCase() })}
        </p>
      </CardContent>
    </Card>
  )
}
