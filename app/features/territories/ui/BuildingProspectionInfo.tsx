import type { Building } from '~/database/generated/client'
import { type ShopKind, shopKindLabels } from '~/features/territories/model/shop-kind.type'

export default function BuildingProspectionInfo({ buidling }: { buidling: Building }) {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-gray-900 p-5 text-white">
      <h2 className="mb-4 text-xl">Données de prospection</h2>

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
        <p className="pt-5">
          Une <span className="text-teal-600">résidence universitaire</span> est disponible pour la prédication dans ce
          batiment
        </p>
      )}
      {buidling.hasHotel && (
        <p className="pt-5">
          Un <span className="text-teal-600">hotel</span> est disponible pour la prédication dans ce batiment.
        </p>
      )}
      {buidling.hasLandromat && (
        <p className="pt-5">
          Une <span className="text-teal-600">laverie automatique</span> est disponible dans ce batiment.
        </p>
      )}
      <p className="pt-5">
        Donnée à jour du :{' '}
        <span className="text-teal-600">
          {buidling.prospectionDate?.toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })}
        </span>
      </p>
      <p className="pt-5 text-sm italic">
        Pour modifier ces données, merci d'utiliser le formulaire de modification de prospection grâce au bouton en
        forme de loupe en haut à droite.
      </p>
    </div>
  )
}

function HomeInfos({ homes, phones, hasOther }: { homes: number; phones: number; hasOther: boolean }) {
  if (homes < 1 && phones < 1) {
    return (
      <p>
        Impossible de faire du <span className="text-teal-600">Porte à Porte</span> dans ce batiment.{' '}
        {hasOther && 'Mais :'}
      </p>
    )
  }

  return (
    <>
      <p>
        Le batiment peut être fait en <span className="text-teal-600">Porte à Porte</span>.
      </p>
      <p>
        Nombre de foyers : <span className="text-teal-600">{homes ?? 0}</span>
      </p>
      <p>
        Nombre de numéros de téléphone disponibles dans les annuaires :{' '}
        <span className="text-teal-600">{phones ?? 0}</span>
      </p>
    </>
  )
}

function ShopInfos({ hasShops, shopKind }: { hasShops: boolean; shopKind: ShopKind }) {
  if (hasShops === false) return

  return (
    <>
      <p className="pt-5">
        Un <span className="text-teal-600">commerce</span> est disponible pour la prédication dans ce batiment.
      </p>
      <p>
        Type de commerce : <span className="text-teal-600">{shopKindLabels[shopKind]}</span>
      </p>
    </>
  )
}
