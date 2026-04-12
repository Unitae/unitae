import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { BuildingAccess, BuildingEntrance, BuildingResidentialData } from '~/database/generated/client'
import { type EntranceKind, entranceKindLabels } from '~/features/territories/model/entrance-kind.type'
import { ShopKind } from '~/features/territories/model/shop-kind.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
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
}: {
  entrance: EntranceWithRelations | undefined
  residentialData: BuildingResidentialData | null
  isDisabled: boolean
}) {
  const [access, setAccess] = useState(entrance?.access)
  const disabledStyle = isDisabled ? 'cursor-not-allowed opacity-50' : ''

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Entrée résidentielle
          <Badge variant="outline">Porte à porte</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>Type d'accès</Label>
            <select
              className={`rounded-md border border-input bg-background px-3 py-2 text-sm ${disabledStyle}`}
              defaultValue={entrance?.access ?? ''}
              name="access"
              value={access ?? ''}
              onChange={e => setAccess(Number(e.target.value))}
              disabled={isDisabled}
            >
              <option>Sélectionner un type d'accès</option>
              <option value={TerritoryAccess.Intercom}>Interphone</option>
              <option value={TerritoryAccess.Code}>Digicode</option>
              <option value={TerritoryAccess.Doorbell}>Sonnette extérieur</option>
            </select>
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>Nombre de logements</Label>
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
              Les portes sont ouvertes le matin
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                className={`rounded border border-input ${disabledStyle}`}
                name="mailboxes"
                type="checkbox"
                defaultChecked={entrance?.isMailboxOpen ?? false}
                disabled={isDisabled}
              />
              Les boites aux lettres sont accessibles
            </label>
          </>
        )}

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>Nombre de téléphones</Label>
            <Input
              defaultValue={residentialData?.phones ?? ''}
              name="phones"
              type="number"
              disabled={isDisabled}
              className={disabledStyle}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>Nombre de libéraux</Label>
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
            Accessible pour les <span className="font-semibold text-primary">Personnes à Mobilité Réduite</span>
          </span>
        </label>
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
          <CardTitle className="flex items-center gap-2">
            {entranceKindLabels['commerce' as EntranceKind]}
          </CardTitle>
          {onDelete && (
            <Button type="button" variant="ghost" size="icon" onClick={onDelete} title="Supprimer cette entrée">
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <input type="hidden" name="shops" value="on" />
        <div className="flex flex-col gap-1.5">
          <Label>Catégorie de commerce principale</Label>
          <select
            className={`rounded-md border border-input bg-background px-3 py-2 text-sm ${disabledStyle}`}
            defaultValue={entrance?.shopKind ?? ''}
            name="shopkinds"
            disabled={isDisabled}
            required
          >
            <option>Sélectionner un type de commerce</option>
            <option value={ShopKind.Food}>Alimentaire</option>
            <option value={ShopKind.Clothing}>Vêtements / Chaussures</option>
            <option value={ShopKind.Jewelry}>Bijoux</option>
            <option value={ShopKind.Health}>Santé / Optique</option>
            <option value={ShopKind.Home}>Maison</option>
            <option value={ShopKind.Catering}>Restaurant / Café / Snack</option>
            <option value={ShopKind.Cosmetics}>Coiffure / Cosmétiques</option>
            <option value={ShopKind.Tech}>Technologie</option>
            <option value={ShopKind.Newspaper}>Tabac / Press</option>
            <option value={ShopKind.GasStation}>Station Services</option>
            <option value={ShopKind.Other}>Autres</option>
          </select>
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
          <CardTitle className="flex items-center gap-2">{entranceKindLabels[kind]}</CardTitle>
          {onDelete && (
            <Button type="button" variant="ghost" size="icon" onClick={onDelete} title="Supprimer cette entrée">
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <input type="hidden" name={formName} value="on" />
        <p className="text-muted-foreground text-sm">
          Cette entrée indique la présence d'un(e) {entranceKindLabels[kind].toLowerCase()} dans ce batiment.
        </p>
      </CardContent>
    </Card>
  )
}
