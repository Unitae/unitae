import type { Building, BuildingEntrance } from '~/database/generated/client'
import { type EntranceKind, entranceKindLabels } from '~/features/territories/model/entrance-kind.type'
import { type ShopKind, shopKindLabels } from '~/features/territories/model/shop-kind.type'
import { Badge } from '~/shared/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'

type BuildingWithEntrances = Building & { entrances: BuildingEntrance[] }

export default function BuildingProspectionInfo({ building }: { building: BuildingWithEntrances }) {
  const residentialEntrance = building.entrances.find(e => e.kind === 'residential')
  const otherEntrances = building.entrances.filter(e => e.kind !== 'residential')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Données de prospection</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <HomeInfos
          homes={residentialEntrance?.homes ?? 0}
          phones={residentialEntrance?.phones ?? 0}
          hasOther={otherEntrances.length > 0}
        />

        {otherEntrances.map(entrance => (
          <EntranceInfo key={entrance.id} entrance={entrance} />
        ))}

        <p className="pt-3">
          Donnée à jour du :{' '}
          <span className="font-medium text-primary">
            {building.prospectionDate?.toLocaleDateString('fr-FR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })}
          </span>
        </p>
        <p className="text-muted-foreground text-sm italic">
          Pour modifier ces données, merci d'utiliser le formulaire de modification de prospection grâce au bouton en
          forme de loupe en haut à droite.
        </p>
      </CardContent>
    </Card>
  )
}

function HomeInfos({ homes, phones, hasOther }: { homes: number; phones: number; hasOther: boolean }) {
  if (homes < 1 && phones < 1) {
    return (
      <p>
        Impossible de faire du <span className="font-medium text-primary">Porte à Porte</span> dans ce batiment.{' '}
        {hasOther && 'Mais :'}
      </p>
    )
  }

  return (
    <>
      <p>
        Le batiment peut être fait en <span className="font-medium text-primary">Porte à Porte</span>.
      </p>
      <p>
        Nombre de foyers : <span className="font-medium text-primary">{homes ?? 0}</span>
      </p>
      <p>
        Nombre de numéros de téléphone disponibles dans les annuaires :{' '}
        <span className="font-medium text-primary">{phones ?? 0}</span>
      </p>
    </>
  )
}

function EntranceInfo({ entrance }: { entrance: BuildingEntrance }) {
  const kindLabel = entranceKindLabels[entrance.kind as EntranceKind] ?? entrance.kind

  if (entrance.kind === 'commerce') {
    const shopLabel = shopKindLabels[entrance.shopKind as ShopKind] ?? 'Autres'
    return (
      <p className="pt-3">
        Un <span className="font-medium text-primary">commerce</span> est disponible pour la prédication dans ce
        batiment. <Badge variant="outline">{shopLabel}</Badge>
      </p>
    )
  }

  return (
    <p className="pt-3">
      Une <span className="font-medium text-primary">{kindLabel}</span> est disponible dans ce batiment.
    </p>
  )
}
