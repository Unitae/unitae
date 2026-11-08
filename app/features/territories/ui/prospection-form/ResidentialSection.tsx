import { FormSection, SegmentedControl } from '@unitae/ui'
import { Home } from 'lucide-react'
import { useState } from 'react'
import type { BuildingResidentialData } from '~/database/generated/client'
import type { DetailedBuildingEntrance } from '~/features/territories/model/detailed-building.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import * as m from '~/i18n/paraglide/messages'
import { Checkbox } from '~/shared/ui/checkbox'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Textarea } from '~/shared/ui/textarea'
import { DeleteEntranceButton, NotesLabel } from './EntranceSections'
import { SharedAccessField, type StreetBuilding } from './SharedAccessField'

const CODE = String(TerritoryAccess.Code)

interface ResidentialSectionProps {
  entrance: DetailedBuildingEntrance | undefined
  /** This building's own households, phones and liberals. */
  figures: BuildingResidentialData | null
  /** The access-sharing field, for those allowed to link buildings. */
  sharing: { territories: string[]; linked: StreetBuilding[]; candidates: StreetBuilding[] } | null
  onDelete: () => void
}

/** The door-to-door entrance: how to get in, how many homes, and what publishers should know. */
export function ResidentialSection({ entrance, figures, sharing, onDelete }: ResidentialSectionProps) {
  // Kept as posted: an access recorded outside these three choices shows no choice and is saved unchanged.
  const [access, setAccess] = useState<string | null>(entrance?.access != null ? String(entrance.access) : null)
  const options = [
    { value: String(TerritoryAccess.Intercom), label: m.prospection_entrance_access_intercom() },
    { value: CODE, label: m.prospection_entrance_access_digicode() },
    { value: String(TerritoryAccess.Doorbell), label: m.prospection_entrance_access_doorbell() },
  ]

  return (
    <FormSection
      kicker={
        <>
          <Home aria-hidden="true" />
          {m.prospection_entrance_door_to_door_badge()}
        </>
      }
      title={m.prospection_entrance_residential_title()}
      description={m.building_section_residential_description()}
      actions={<DeleteEntranceButton onClick={onDelete} />}
    >
      <input type="hidden" name="has-residential" value="on" />
      <div className="col-span-full flex flex-col gap-1.5">
        <span className="font-medium text-sm">{m.prospection_entrance_access_type_label()}</span>
        <input type="hidden" name="access" value={access ?? ''} />
        <SegmentedControl
          aria-label={m.prospection_entrance_access_type_label()}
          options={options}
          value={options.some(option => option.value === access) ? access : null}
          onValueChange={setAccess}
          className="w-full max-w-[480px]"
        />
      </div>
      {access === CODE && (
        <div className="col-span-full flex animate-fade-in-up flex-col gap-0.5 rounded-md bg-sidebar px-3 py-2.5">
          <span className="mb-0.5 text-faint text-xs">{m.building_digicode_options()}</span>
          <CheckboxField name="doors" defaultChecked={entrance?.isOpenEarly ?? false}>
            {m.prospection_entrance_doors_open_morning()}
          </CheckboxField>
          <CheckboxField name="mailboxes" defaultChecked={entrance?.isMailboxOpen ?? false}>
            {m.prospection_entrance_mailboxes_accessible()}
          </CheckboxField>
        </div>
      )}
      <NumberField name="homes" label={m.prospection_entrance_homes_label()} value={figures?.homes} />
      <NumberField name="phones" label={m.prospection_entrance_phones_label()} value={figures?.phones} />
      <NumberField name="liberals" label={m.prospection_entrance_liberals_label()} value={figures?.liberals} />
      <div className="col-span-full">
        <CheckboxField name="pmr" defaultChecked={entrance?.isPMR ?? false}>
          {m.building_pmr()}
        </CheckboxField>
      </div>
      <div className="col-span-full flex flex-col gap-1.5">
        <NotesLabel htmlFor="residential-notes" />
        <Textarea id="residential-notes" name="residential-notes" rows={3} defaultValue={entrance?.notes ?? ''} />
      </div>
      {sharing && <SharedAccessField {...sharing} />}
    </FormSection>
  )
}

function NumberField({ name, label, value }: { name: string; label: string; value: number | null | undefined }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type="number" min={0} inputMode="numeric" defaultValue={value ?? ''} />
    </div>
  )
}

function CheckboxField({
  name,
  defaultChecked,
  children,
}: {
  name: string
  defaultChecked: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-8 items-center gap-2.5">
      <Checkbox id={name} name={name} defaultChecked={defaultChecked} />
      <Label htmlFor={name} className="font-normal">
        {children}
      </Label>
    </div>
  )
}
