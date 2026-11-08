import { FormSection } from '@unitae/ui'
import { useEffect, useState } from 'react'
import { Form } from 'react-router'
import type { DetailedBuilding } from '~/features/territories/model/detailed-building.type'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { countProspectionChanges } from '~/features/territories/model/prospection-changes'
import { uniqueTerritories } from '~/features/territories/model/unique-territories'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { FormSaveBar } from '~/shared/ui/FormSaveBar'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { AddEntranceSection, CommerceSection, SimpleEntranceSection, UNIQUE_ENTRANCE_FIELDS } from './EntranceSections'
import { ResidentialSection } from './ResidentialSection'
import type { StreetBuilding } from './SharedAccessField'

interface ProspectionFormProps {
  building: DetailedBuilding
  /** Same-street buildings that may share the residential access, or `null` when the viewer may not link. */
  streetBuildings: StreetBuilding[] | null
}

/** The prospection form, with its save bar and the leave-without-saving guard. */
export function ProspectionForm(props: ProspectionFormProps) {
  const { blocker, setDirty } = useUnsavedChanges()
  const [version, setVersion] = useState(0)
  return (
    <>
      <UnsavedChangesDialog blocker={blocker} />
      {/* A new starting point after « Annuler », and after a save brings back fresher data. */}
      <ProspectionFormBody
        key={`${version}-${String(props.building.updatedAt)}`}
        {...props}
        onDirtyChange={setDirty}
        onCancel={() => setVersion(current => current + 1)}
      />
    </>
  )
}

interface Entry {
  key: string
  kind: EntranceKind
  entranceId?: number
}

let nextKey = 0

const ADDABLE = [
  EntranceKind.Residential,
  EntranceKind.Commerce,
  EntranceKind.Hotel,
  EntranceKind.Campus,
  EntranceKind.Laundromat,
]

interface BodyProps extends ProspectionFormProps {
  onDirtyChange: (dirty: boolean) => void
  onCancel: () => void
}

function ProspectionFormBody({ building, streetBuildings, onDirtyChange, onCancel }: BodyProps) {
  const { ref, changes } = useFormChanges(countProspectionChanges)
  useEffect(() => onDirtyChange(changes > 0), [changes, onDirtyChange])

  // In id order: the server pairs the posted shops with the stored ones by position.
  const entrances = [...building.entrances].sort((a, b) => a.id - b.id)
  const residential = entrances.find(entrance => entrance.kind === EntranceKind.Residential)
  const [hasResidential, setHasResidential] = useState(residential != null)
  const [entries, setEntries] = useState<Entry[]>(() =>
    entrances
      .filter(entrance => entrance.kind !== EntranceKind.Residential)
      .map(entrance => ({ key: String(entrance.id), kind: entrance.kind, entranceId: entrance.id })),
  )

  const present = new Set([...(hasResidential ? [EntranceKind.Residential] : []), ...entries.map(({ kind }) => kind)])
  const addable = ADDABLE.filter(kind => kind === EntranceKind.Commerce || !present.has(kind))

  function add(kind: EntranceKind) {
    if (kind === EntranceKind.Residential) setHasResidential(true)
    else setEntries([...entries, { key: `new-${++nextKey}`, kind }])
  }

  // The territories of this residential entrance. The buildings already sharing it are in them by definition.
  const territories = uniqueTerritories(residential ? [residential] : []).map(territory => territory.number)
  const sharing =
    streetBuildings == null
      ? null
      : {
          territories,
          linked: (residential?.buildings ?? [])
            .filter(({ id }) => id !== building.id)
            .map(({ id, number, street }) => ({ id, number, street, territories })),
          candidates: streetBuildings,
        }

  return (
    <Form method="post" ref={ref} className="flex flex-col pb-24">
      <FormSection
        title={m.building_section_prospection_title()}
        description={m.building_section_prospection_description()}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="prospection-date">{m.prospection_edit_prospection_date_label()}</Label>
          <Input
            id="prospection-date"
            name="prospection-date"
            type="date"
            defaultValue={building.prospectionDate?.toLocaleDateString('en-CA') ?? ''}
          />
        </div>
      </FormSection>

      {hasResidential && (
        <ResidentialSection
          entrance={residential}
          figures={building.residentialData}
          sharing={sharing}
          onDelete={() => setHasResidential(false)}
        />
      )}

      {entries.map(entry =>
        entry.kind === EntranceKind.Commerce ? (
          <CommerceSection
            key={entry.key}
            entryKey={entry.key}
            entrance={entrances.find(({ id }) => id === entry.entranceId)}
            onDelete={() => setEntries(entries.filter(({ key }) => key !== entry.key))}
          />
        ) : (
          UNIQUE_ENTRANCE_FIELDS[entry.kind] && (
            <SimpleEntranceSection
              key={entry.key}
              kind={entry.kind}
              onDelete={() => setEntries(entries.filter(({ key }) => key !== entry.key))}
            />
          )
        ),
      )}

      {addable.length > 0 && <AddEntranceSection kinds={addable} onAdd={add} />}

      {changes > 0 && (
        <FormSaveBar changes={changes}>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {m.common_cancel()}
          </Button>
          <SubmitButton>{m.prospection_edit_prospection_submit()}</SubmitButton>
        </FormSaveBar>
      )}
    </Form>
  )
}
