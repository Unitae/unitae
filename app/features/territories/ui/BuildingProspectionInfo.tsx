import type { Building, BuildingEntrance } from '~/database/generated/client'
import { type EntranceKind, entranceKindLabels } from '~/features/territories/model/entrance-kind.type'
import { type ShopKind, shopKindLabels } from '~/features/territories/model/shop-kind.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'

type BuildingWithEntrances = Building & { entrances: BuildingEntrance[] }

const accessLabels: Record<number, string> = {
  [TerritoryAccess.Intercom]: 'interphone',
  [TerritoryAccess.Code]: 'digicode',
  [TerritoryAccess.Doorbell]: 'sonnette extérieure',
}

export default function BuildingProspectionInfo({ building }: { building: BuildingWithEntrances }) {
  const residentialEntrance = building.entrances.find(e => e.kind === 'residential')
  const commerceEntrances = building.entrances.filter(e => e.kind === 'commerce')
  const otherEntrances = building.entrances.filter(e => e.kind !== 'residential' && e.kind !== 'commerce')
  const allNotes = building.entrances.filter(e => e.notes.length > 0)
  const hasProspectionData = building.prospectionDate != null || building.entrances.length > 0

  if (!hasProspectionData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Résumé de prospection</CardTitle>
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
        <CardTitle>Résumé de prospection</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {residentialEntrance != null && <ResidentialSummary entrance={residentialEntrance} />}

        {residentialEntrance == null && (
          <p>Ce batiment ne contient pas de logements résidentiels.</p>
        )}

        {commerceEntrances.length > 0 && <CommerceSummary entrances={commerceEntrances} />}

        {otherEntrances.map(entrance => (
          <OtherEntranceSummary key={entrance.id} entrance={entrance} />
        ))}

        {allNotes.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 rounded-md border border-destructive/20 bg-destructive/5 p-3">
            {allNotes.map(entrance => (
              <p key={entrance.id} className="text-destructive text-sm">
                <span className="font-medium">
                  {entranceKindLabels[entrance.kind as EntranceKind] ?? entrance.kind} :
                </span>{' '}
                {entrance.notes}
              </p>
            ))}
          </div>
        )}

        {building.prospectionDate != null && (
          <p className="mt-2 text-muted-foreground text-sm">
            Dernière prospection le{' '}
            {building.prospectionDate.toLocaleDateString('fr-FR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        )}

        <p className="text-muted-foreground text-sm italic">
          Pour modifier ces données, utilisez le bouton en forme de loupe en haut à droite.
        </p>
      </CardContent>
    </Card>
  )
}

function describeResidentialCounts(entrance: BuildingEntrance): string[] {
  const homes = entrance.homes ?? 0
  const phones = entrance.phones ?? 0
  const liberals = entrance.liberals ?? 0
  const parts: string[] = []

  if (homes > 0) parts.push(`${homes} foyer${homes > 1 ? 's' : ''}`)
  if (phones > 0) parts.push(`${phones} numéro${phones > 1 ? 's' : ''} de téléphone`)
  if (liberals > 0) parts.push(`${liberals} professionnel${liberals > 1 ? 's' : ''} libéra${liberals > 1 ? 'ux' : 'l'}`)

  return parts
}

function describeAccess(entrance: BuildingEntrance): string[] {
  const parts: string[] = []
  const label = entrance.access != null ? accessLabels[entrance.access] : null

  if (label != null) parts.push(`accessible par ${label}`)
  if (entrance.access === TerritoryAccess.Code && entrance.isOpenEarly) parts.push('portes ouvertes le matin')
  if (entrance.access === TerritoryAccess.Code && entrance.isMailboxOpen) parts.push('boites aux lettres accessibles')
  if (entrance.isPMR) parts.push('accessible PMR')

  return parts
}

function ResidentialSummary({ entrance }: { entrance: BuildingEntrance }) {
  const counts = describeResidentialCounts(entrance)
  const accessParts = describeAccess(entrance)

  if (counts.length === 0) {
    return <p>L'entrée résidentielle est présente mais aucun foyer ni téléphone n'a été recensé.</p>
  }

  return (
    <p>
      Ce batiment contient <span className="font-medium text-primary">{counts.join(', ')}</span>
      {accessParts.length > 0 && (
        <>
          {' '}
          (<span className="text-muted-foreground">{accessParts.join(', ')}</span>)
        </>
      )}
      .
    </p>
  )
}

function CommerceSummary({ entrances }: { entrances: BuildingEntrance[] }) {
  if (entrances.length === 1) {
    const shopLabel = shopKindLabels[entrances[0].shopKind as ShopKind] ?? 'commerce'
    return (
      <p>
        Un commerce de type <span className="font-medium text-primary">{shopLabel.toLowerCase()}</span> est disponible
        pour la prédication.
      </p>
    )
  }

  const labels = entrances
    .map(e => shopKindLabels[e.shopKind as ShopKind]?.toLowerCase() ?? 'autre')

  return (
    <p>
      <span className="font-medium text-primary">{entrances.length} commerces</span> sont disponibles pour la
      prédication : {labels.join(', ')}.
    </p>
  )
}

function OtherEntranceSummary({ entrance }: { entrance: BuildingEntrance }) {
  const kindLabel = entranceKindLabels[entrance.kind as EntranceKind]?.toLowerCase() ?? entrance.kind

  if (entrance.kind === 'hotel') {
    return (
      <p>
        Un <span className="font-medium text-primary">hôtel</span> est présent dans ce batiment.
      </p>
    )
  }

  if (entrance.kind === 'campus') {
    return (
      <p>
        Une <span className="font-medium text-primary">résidence universitaire</span> est présente dans ce batiment.
      </p>
    )
  }

  if (entrance.kind === 'laundromat') {
    return (
      <p>
        Une <span className="font-medium text-primary">laverie automatique</span> est présente dans ce batiment.
      </p>
    )
  }

  return (
    <p>
      Une entrée de type <span className="font-medium text-primary">{kindLabel}</span> est présente dans ce batiment.
    </p>
  )
}
