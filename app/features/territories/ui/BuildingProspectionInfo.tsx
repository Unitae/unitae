import type { Building } from '~/database/generated/client'
import { type ShopKind, shopKindLabels } from '~/features/territories/model/shop-kind.type'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'

export default function BuildingProspectionInfo({ buidling }: { buidling: Building }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Données de prospection</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <HomeInfos
          homes={buidling.homes ?? 0}
          phones={buidling.phones ?? 0}
          hasOther={
            Boolean(buidling.hasCampus) ||
            Boolean(buidling.hasHotel) ||
            Boolean(buidling.hasLandromat) ||
            Boolean(buidling.hasShops)
          }
        />

        <ShopInfos hasShops={Boolean(buidling.hasShops)} shopKind={buidling.shopKind as ShopKind} />

        {buidling.hasCampus && (
          <p>
            Une <span className="font-medium text-primary">résidence universitaire</span> est disponible pour la
            prédication dans ce batiment
          </p>
        )}
        {buidling.hasHotel && (
          <p>
            Un <span className="font-medium text-primary">hotel</span> est disponible pour la prédication dans ce
            batiment.
          </p>
        )}
        {buidling.hasLandromat && (
          <p>
            Une <span className="font-medium text-primary">laverie automatique</span> est disponible dans ce batiment.
          </p>
        )}
        <p className="pt-3">
          Donnée à jour du :{' '}
          <span className="font-medium text-primary">
            {buidling.prospectionDate?.toLocaleDateString('fr-FR', {
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

function ShopInfos({ hasShops, shopKind }: { hasShops: boolean; shopKind: ShopKind }) {
  if (hasShops === false) return

  return (
    <>
      <p className="pt-3">
        Un <span className="font-medium text-primary">commerce</span> est disponible pour la prédication dans ce
        batiment.
      </p>
      <p>
        Type de commerce : <span className="font-medium text-primary">{shopKindLabels[shopKind]}</span>
      </p>
    </>
  )
}
