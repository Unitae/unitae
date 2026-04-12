import type { Building, BuildingEntrance } from '~/database/generated/client'
import { type EntranceKind, entranceKindLabels } from '~/features/territories/model/entrance-kind.type'
import { type ShopKind, shopKindLabels } from '~/features/territories/model/shop-kind.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { Badge } from '~/shared/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'

type BuildingWithEntrances = Building & { entrances: BuildingEntrance[] }

const accessLabels: Record<number, string> = {
  [TerritoryAccess.Intercom]: 'Interphone',
  [TerritoryAccess.Code]: 'Digicode',
  [TerritoryAccess.Doorbell]: 'Sonnette',
}

export default function BuildingProspectionInfo({ building }: { building: BuildingWithEntrances }) {
  const residentialEntrance = building.entrances.find(e => e.kind === 'residential')
  const otherEntrances = building.entrances.filter(e => e.kind !== 'residential')
  const hasProspectionData = building.prospectionDate != null || building.entrances.length > 0

  if (!hasProspectionData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Données de prospection</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground italic">
            Ce batiment n'a pas encore été prospecté. Utilisez le bouton en forme de loupe pour saisir les données de
            prospection.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Données de prospection</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {residentialEntrance != null && <ResidentialInfo entrance={residentialEntrance} />}

        {residentialEntrance == null && otherEntrances.length > 0 && (
          <p className="text-muted-foreground italic">Pas d'entrée résidentielle pour ce batiment.</p>
        )}

        {otherEntrances.map(entrance => (
          <EntranceInfo key={entrance.id} entrance={entrance} />
        ))}

        {building.prospectionDate != null && (
          <p className="pt-3">
            Donnée à jour du :{' '}
            <span className="font-medium text-primary">
              {building.prospectionDate.toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              })}
            </span>
          </p>
        )}

        <p className="text-muted-foreground text-sm italic">
          Pour modifier ces données, merci d'utiliser le formulaire de modification de prospection grâce au bouton en
          forme de loupe en haut à droite.
        </p>
      </CardContent>
    </Card>
  )
}

function ResidentialInfo({ entrance }: { entrance: BuildingEntrance }) {
  const homes = entrance.homes ?? 0
  const phones = entrance.phones ?? 0

  return (
    <>
      {homes < 1 && phones < 1 ? (
        <p>
          Impossible de faire du <span className="font-medium text-primary">Porte à Porte</span> dans ce batiment.
        </p>
      ) : (
        <>
          <p>
            Le batiment peut être fait en <span className="font-medium text-primary">Porte à Porte</span>.
          </p>
          {homes > 0 && (
            <p>
              Nombre de foyers : <span className="font-medium text-primary">{homes}</span>
            </p>
          )}
          {phones > 0 && (
            <p>
              Nombre de numéros de téléphone : <span className="font-medium text-primary">{phones}</span>
            </p>
          )}
        </>
      )}
      {entrance.access != null && (
        <p>
          Accès : <span className="font-medium text-primary">{accessLabels[entrance.access] ?? 'Inconnu'}</span>
          {entrance.access === TerritoryAccess.Code && entrance.isOpenEarly && ' — Ouvert le matin'}
          {entrance.access === TerritoryAccess.Code && entrance.isMailboxOpen && ' — Boites aux lettres accessibles'}
        </p>
      )}
      {entrance.isPMR && (
        <p>
          <span className="font-medium text-primary">Accessible PMR</span>
        </p>
      )}
      {entrance.notes.length > 0 && (
        <p className="text-destructive italic">{entrance.notes}</p>
      )}
    </>
  )
}

function EntranceInfo({ entrance }: { entrance: BuildingEntrance }) {
  const kindLabel = entranceKindLabels[entrance.kind as EntranceKind] ?? entrance.kind

  if (entrance.kind === 'commerce') {
    const shopLabel = shopKindLabels[entrance.shopKind as ShopKind] ?? 'Autres'
    return (
      <div className="pt-3">
        <p>
          Un <span className="font-medium text-primary">commerce</span> est disponible pour la prédication dans ce
          batiment. <Badge variant="outline">{shopLabel}</Badge>
        </p>
        {entrance.notes.length > 0 && (
          <p className="text-destructive italic">{entrance.notes}</p>
        )}
      </div>
    )
  }

  return (
    <div className="pt-3">
      <p>
        Une <span className="font-medium text-primary">{kindLabel}</span> est disponible dans ce batiment.
      </p>
      {entrance.notes.length > 0 && (
        <p className="text-destructive italic">{entrance.notes}</p>
      )}
    </div>
  )
}
