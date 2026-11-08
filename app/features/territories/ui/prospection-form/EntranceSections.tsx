import { FormSection } from '@unitae/ui'
import { BedDouble, GraduationCap, Home, type LucideIcon, Plus, Store, Trash2, WashingMachine } from 'lucide-react'
import { useState } from 'react'
import type { BuildingEntrance } from '~/database/generated/client'
import { EntranceKind, entranceKindLabels } from '~/features/territories/model/entrance-kind.type'
import { ShopKind, shopKindLabels } from '~/features/territories/model/shop-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { Textarea } from '~/shared/ui/textarea'

const KIND_ICONS: Record<EntranceKind, LucideIcon> = {
  [EntranceKind.Residential]: Home,
  [EntranceKind.Commerce]: Store,
  [EntranceKind.Hotel]: BedDouble,
  [EntranceKind.Campus]: GraduationCap,
  [EntranceKind.Laundromat]: WashingMachine,
}

/** The form field each single-occurrence entrance posts (the laundromat's name is misspelt in the schema). */
export const UNIQUE_ENTRANCE_FIELDS: Partial<Record<EntranceKind, string>> = {
  [EntranceKind.Hotel]: 'hotel',
  [EntranceKind.Campus]: 'campus',
  [EntranceKind.Laundromat]: 'landromat',
}

export function DeleteEntranceButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="-ml-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 />
      {m.prospection_entrance_delete_title()}
    </Button>
  )
}

export function NotesLabel({ htmlFor }: { htmlFor: string }) {
  return (
    <Label htmlFor={htmlFor}>
      {m.prospection_entrance_notes_label()}
      <span className="font-normal text-faint">· {m.prospection_entrance_notes_visibility()}</span>
    </Label>
  )
}

function Kicker({ kind }: { kind: EntranceKind }) {
  const Icon = KIND_ICONS[kind]
  return (
    <>
      <Icon aria-hidden="true" />
      {entranceKindLabels()[kind]}
    </>
  )
}

interface CommerceSectionProps {
  /** Pairs this shop's fields with the loaded ones when counting changes. */
  entryKey: string
  entrance: BuildingEntrance | undefined
  onDelete: () => void
}

/** One shop: its category names the section, since a shop has no name of its own in the database. */
export function CommerceSection({ entryKey, entrance, onDelete }: CommerceSectionProps) {
  const [kind, setKind] = useState(entrance?.shopKind ?? '')
  const labels = shopKindLabels()
  const notesId = `commerce-notes-${entryKey}`

  return (
    <FormSection
      kicker={<Kicker kind={EntranceKind.Commerce} />}
      title={labels[kind as ShopKind] ?? entranceKindLabels()[EntranceKind.Commerce]}
      actions={<DeleteEntranceButton onClick={onDelete} />}
    >
      <input type="hidden" name="commerce-key" value={entryKey} />
      <div className="flex flex-col gap-1.5">
        <Label>{m.prospection_entrance_commerce_category()}</Label>
        <Select name="shopkinds" value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-full" aria-label={m.prospection_entrance_commerce_category()}>
            <SelectValue placeholder={m.prospection_entrance_commerce_select()} />
          </SelectTrigger>
          <SelectContent>
            {Object.values(ShopKind).map(value => (
              <SelectItem key={value} value={value}>
                {labels[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-full flex flex-col gap-1.5">
        <NotesLabel htmlFor={notesId} />
        <Textarea
          id={notesId}
          name="commerce-notes"
          rows={2}
          placeholder={m.building_commerce_notes_placeholder()}
          defaultValue={entrance?.notes ?? ''}
        />
      </div>
    </FormSection>
  )
}

/** A hotel, campus or laundromat: its presence is the whole record. */
export function SimpleEntranceSection({ kind, onDelete }: { kind: EntranceKind; onDelete: () => void }) {
  const label = entranceKindLabels()[kind]
  return (
    <FormSection kicker={<Kicker kind={kind} />} title={label} actions={<DeleteEntranceButton onClick={onDelete} />}>
      <input type="hidden" name={UNIQUE_ENTRANCE_FIELDS[kind]} value="on" />
      <p className="col-span-full text-muted-foreground text-sm">
        {m.prospection_entrance_simple_description({ kind: label.toLowerCase() })}
      </p>
    </FormSection>
  )
}

export function AddEntranceSection({ kinds, onAdd }: { kinds: EntranceKind[]; onAdd: (kind: EntranceKind) => void }) {
  return (
    <FormSection title={m.building_section_add_title()} description={m.building_section_add_description()}>
      <Select value="" onValueChange={value => value && onAdd(value as EntranceKind)}>
        <SelectTrigger className="w-full" aria-label={m.building_section_add_title()}>
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Plus className="size-4" aria-hidden="true" />
            <SelectValue placeholder={m.prospection_edit_prospection_add_entrance()} />
          </span>
        </SelectTrigger>
        <SelectContent>
          {kinds.map(kind => (
            <SelectItem key={kind} value={kind}>
              {entranceKindLabels()[kind]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormSection>
  )
}
