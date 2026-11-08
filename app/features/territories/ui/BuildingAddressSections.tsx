import { type FieldMetadata, getInputProps } from '@conform-to/react'
import { FormSection } from '@unitae/ui'
import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

type Field = FieldMetadata<unknown, Record<string, unknown>, string[]>

interface BuildingAddressSectionsProps {
  fields: { number: Field; street: Field; zip: Field; latitude: Field; longitude: Field }
  /** The stored values, when editing an existing building. */
  defaults?: {
    number: string
    street: string
    zip: string
    latitude: number | null
    longitude: number | null
  }
}

/** The address and the map position of a building, as two form sections. */
export function BuildingAddressSections({ fields, defaults }: BuildingAddressSectionsProps) {
  return (
    <>
      <FormSection title={m.building_section_address_title()} description={m.building_section_address_description()}>
        <AddressField
          field={fields.number}
          label={m.territories_form_number()}
          placeholder={m.prospection_new_building_number_placeholder()}
          defaultValue={defaults?.number}
        />
        <AddressField
          field={fields.street}
          label={m.prospection_new_building_street_label()}
          placeholder={m.prospection_new_building_street_placeholder()}
          defaultValue={defaults?.street}
        />
        <AddressField
          field={fields.zip}
          label={m.prospection_new_building_zip_label()}
          placeholder={m.prospection_new_building_zip_placeholder()}
          defaultValue={defaults?.zip}
        />
      </FormSection>
      <FormSection title={m.building_section_position_title()} description={m.building_section_position_description()}>
        <AddressField
          field={fields.latitude}
          type="number"
          label={m.prospection_table_latitude()}
          defaultValue={defaults?.latitude ?? undefined}
        />
        <AddressField
          field={fields.longitude}
          type="number"
          label={m.prospection_table_longitude()}
          defaultValue={defaults?.longitude ?? undefined}
        />
      </FormSection>
    </>
  )
}

interface AddressFieldProps {
  field: Field
  label: string
  type?: 'text' | 'number'
  placeholder?: string
  defaultValue?: string | number
}

function AddressField({ field, label, type = 'text', placeholder, defaultValue }: AddressFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={field.id}>{label}</Label>
      <Input
        {...getInputProps(field, { type })}
        placeholder={placeholder}
        // A creation keeps what conform restores after a refused submission.
        {...(defaultValue === undefined ? {} : { defaultValue })}
        step={type === 'number' ? 0.0000001 : undefined}
      />
      {field.errors && <p className="text-destructive text-sm">{field.errors}</p>}
    </div>
  )
}
