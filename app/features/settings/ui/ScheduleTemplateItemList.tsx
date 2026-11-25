import { Plus } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { resolvePartCapability } from '~/features/events'
import {
  groupTemplateParts,
  hallPartDraft,
  type ListedPart,
  newHallDraft,
  type PartDraft,
  sectionPartDraft,
} from '~/features/settings/model/schedule-template-list'
import * as m from '~/i18n/paraglide/messages'
import { getRoleDisplayName, type RoleOption } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { cn } from '~/shared/utils/utils'
import { PartGroupHeader } from './PartGroupHeader'

/** What a part's row says: who may take it. */
export interface ItemListPart extends ListedPart {
  allowedSpeakerRoleIds: number[]
  allowedReaderRoleIds: number[]
  presetId: number | null
  speakerLabel?: string | null
  readerLabel?: string | null
  allowExternalSpeaker?: boolean
}

export interface ItemListService {
  id: number
  name: string
  allowedRoleIds: number[]
}

export type ItemKind = 'part' | 'service'

export type { PartDraft }

/** The `data-item` mark of an item's row, where focus goes back after its form closes. */
export const itemMark = (kind: ItemKind, id: number) => `${kind}-${id}`

const rowClass =
  'flex w-full min-h-12 items-center gap-3 border-border border-b px-3 py-1.5 text-left text-sm outline-none transition-colors duration-(--u-duration-fast) last:border-b-0 hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
const detailClass = 'block truncate text-faint text-xs'

/**
 * A schedule template's parts (by section, a section's halls nested, with the times) or services, as the design
 * round A board draws them. A row opens the item at the panel's second level.
 */
export function ScheduleTemplateItemList({
  kind,
  parts,
  services,
  roles,
  presets,
  onOpen,
  onAdd,
}: {
  kind: ItemKind
  parts: ItemListPart[]
  services: ItemListService[]
  roles: RoleOption[]
  /** The part types, which say whether a part has a second speaker. */
  presets: {
    id: number
    speakerLabel: string | null
    readerLabel: string | null
    hasReaderSlot: boolean
    allowExternalSpeaker: boolean
  }[]
  onOpen: (kind: ItemKind, id: number) => void
  onAdd: (kind: ItemKind, draft?: PartDraft) => void
}) {
  const [newSection, setNewSection] = useState<string | null>(null)
  const newSectionId = useId()
  const newSectionError = useId()
  // Back on « Ajouter une section » once its name is dropped: focus stays in the panel, Escape with it.
  const addSection = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  const dropNewSection = () => {
    refocus.current = true
    setNewSection(null)
  }
  useEffect(() => {
    if (newSection != null || !refocus.current) return
    refocus.current = false
    addSection.current?.focus()
  }, [newSection])
  const roleNames = (ids: number[]) =>
    roles
      .filter(role => ids.includes(role.id))
      .map(role => getRoleDisplayName(role))
      .join(', ')
  const partDetail = (part: ItemListPart) =>
    [
      roleNames(part.allowedSpeakerRoleIds) || m.settings_schedule_templates_anyone(),
      // The second slot as the part's type gives it. Without a type the form always offers one, so saying it would
      // not tell the parts apart.
      ...(part.presetId != null &&
      resolvePartCapability(
        {
          speakerLabel: part.speakerLabel,
          readerLabel: part.readerLabel,
          allowExternalSpeaker: part.allowExternalSpeaker,
        },
        presets.find(preset => preset.id === part.presetId),
      ).hasReaderSlot
        ? [m.settings_schedule_templates_with_reader()]
        : []),
    ].join(' · ')

  const partRow = (part: ItemListPart, indent: string) => (
    <button
      key={part.id}
      type="button"
      data-item={itemMark('part', part.id)}
      onClick={() => onOpen('part', part.id)}
      className={cn(rowClass, indent)}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">{part.name}</span>
        <span className={detailClass}>{partDetail(part)}</span>
      </span>
      <span className={cn('w-14 flex-none text-right tabular-nums', part.durationMin == null && 'text-faint')}>
        {part.durationMin == null ? '—' : m.settings_schedule_templates_minutes({ minutes: part.durationMin })}
      </span>
    </button>
  )

  if (kind === 'service') {
    return (
      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm">{m.settings_schedule_templates_services_label()}</span>
        {services.length === 0 ? (
          <p className="rounded-md border border-border border-dashed px-3 py-3 text-muted-foreground text-sm">
            {m.settings_schedule_templates_services_empty()}
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            {services.map(service => (
              <button
                key={service.id}
                type="button"
                data-item={itemMark('service', service.id)}
                onClick={() => onOpen('service', service.id)}
                className={rowClass}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{service.name}</span>
                  <span className={detailClass}>
                    {roleNames(service.allowedRoleIds) || m.settings_schedule_templates_anyone()}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        <AddButton label={m.settings_schedule_templates_add_service()} onClick={() => onAdd('service')} />
        <p className="text-faint text-xs">{m.settings_schedule_templates_list_note()}</p>
      </div>
    )
  }

  const { runs, total } = groupTemplateParts(parts)
  const sections = [...new Set(parts.map(part => part.section).filter(section => section !== ''))]
  const sectionName = newSection?.trim() ?? ''
  const sectionTaken = sections.includes(sectionName)
  const startSection = () => {
    if (sectionName === '' || sectionTaken) return
    onAdd('part', { section: sectionName, track: '', trackOrder: null, order: lastOrder + 1 })
  }
  const lastOrder = parts.reduce((max, part) => Math.max(max, part.order), -1)
  const addPart = (label: string, draft: PartDraft) => (
    <div className="flex min-h-10 items-center border-border border-b px-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        aria-label={m.settings_schedule_templates_add_part_to({ name: label })}
        onClick={() => onAdd('part', draft)}
      >
        <Plus aria-hidden="true" />
        {m.settings_schedule_templates_part_short()}
      </Button>
    </div>
  )
  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium text-sm">{m.settings_schedule_templates_parts_label()}</span>
      {parts.length === 0 ? (
        <p className="rounded-md border border-border border-dashed px-3 py-3 text-muted-foreground text-sm">
          {m.settings_template_parts_empty()}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          {runs.map((run, index) => {
            const inSection = run.section != null
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: by place, so a renamed section keeps its header (focus, refusal)
              <div key={index}>
                {inSection && (
                  <PartGroupHeader
                    level="section"
                    name={run.section ?? ''}
                    taken={sections.filter(section => section !== run.section)}
                    meta={[
                      ...(run.minutes > 0 ? [m.settings_schedule_templates_minutes({ minutes: run.minutes })] : []),
                      ...(run.halls.length > 1
                        ? [m.settings_schedule_templates_parallel({ count: run.halls.length })]
                        : []),
                    ].join(' · ')}
                    onAddHall={() =>
                      onAdd(
                        'part',
                        newHallDraft(run, lastOrder, {
                          second: m.settings_schedule_templates_second_hall(),
                          nth: number => m.settings_schedule_templates_nth_hall({ number }),
                        }),
                      )
                    }
                  />
                )}
                {run.parts.map(part => partRow(part, inSection ? 'pl-6' : ''))}
                {inSection && run.halls.length === 0 && addPart(run.section ?? '', sectionPartDraft(run, lastOrder))}
                {run.halls.map((hall, hallIndex) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: by place, so a renamed hall keeps its header
                  <div key={hallIndex}>
                    <PartGroupHeader
                      level="hall"
                      name={hall.name}
                      taken={run.halls.map(each => each.name).filter(each => each !== hall.name)}
                      section={run.section ?? ''}
                      meta={[
                        m.programs_new_parts({ count: hall.parts.length }),
                        ...(hall.minutes > 0 ? [m.settings_schedule_templates_minutes({ minutes: hall.minutes })] : []),
                      ].join(' · ')}
                    />
                    {hall.parts.map(part => partRow(part, 'pl-9'))}
                    {addPart(hall.name, hallPartDraft(run, hall, lastOrder))}
                  </div>
                ))}
              </div>
            )
          })}
          <div className="flex flex-wrap justify-between gap-x-3 border-border border-t bg-subtle px-3 py-2 text-faint text-xs tabular-nums">
            <span>{m.settings_schedule_templates_total({ count: total.count, minutes: total.minutes })}</span>
            {total.withoutDuration > 0 && (
              <span>{m.settings_schedule_templates_without_duration({ count: total.withoutDuration })}</span>
            )}
          </div>
        </div>
      )}
      {newSection != null && (
        // The phone's sheet hears Escape first: this mark tells it the name takes it, not the panel.
        <div data-own-escape="" className="flex flex-col gap-2 rounded-md border border-border p-2">
          <label htmlFor={newSectionId} className="sr-only">
            {m.settings_schedule_templates_section_name()}
          </label>
          {/* biome-ignore lint/a11y/noAutofocus: the section the person just asked to add */}
          <Input
            id={newSectionId}
            value={newSection}
            onChange={event => setNewSection(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                startSection()
              }
              if (event.key !== 'Escape') return
              event.preventDefault()
              event.stopPropagation()
              dropNewSection()
            }}
            aria-invalid={sectionTaken || undefined}
            aria-describedby={sectionTaken ? newSectionError : undefined}
            placeholder={m.settings_schedule_templates_section_name()}
            maxLength={80}
            autoFocus
          />
          {sectionTaken && (
            <p id={newSectionError} role="alert" className="text-danger-text text-xs">
              {m.settings_schedule_templates_section_taken()}
            </p>
          )}
          <p className="text-faint text-xs">{m.settings_schedule_templates_new_section_hint()}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={sectionName === '' || sectionTaken} onClick={startSection}>
              <Plus aria-hidden="true" />
              {m.settings_schedule_templates_first_part()}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={dropNewSection}>
              {m.common_cancel()}
            </Button>
          </div>
        </div>
      )}
      {/* Hidden while a new section is named: its own « Première partie » is the part to add then. */}
      {newSection == null && (
        <div className="flex flex-wrap gap-2">
          <AddButton
            label={m.settings_schedule_templates_add_part_loose()}
            onClick={() => onAdd('part', { section: '', track: '', trackOrder: null, order: lastOrder + 1 })}
          />
          <AddButton
            ref={addSection}
            label={m.settings_schedule_templates_add_section()}
            onClick={() => setNewSection('')}
          />
        </div>
      )}
      <p className="text-faint text-xs">{m.settings_schedule_templates_list_note()}</p>
    </div>
  )
}

function AddButton({
  label,
  onClick,
  ref,
}: {
  label: string
  onClick: () => void
  ref?: React.Ref<HTMLButtonElement>
}) {
  return (
    <Button ref={ref} type="button" variant="ghost" size="sm" className="self-start" onClick={onClick}>
      <Plus aria-hidden="true" />
      {label}
    </Button>
  )
}
