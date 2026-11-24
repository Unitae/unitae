import { Plus } from 'lucide-react'
import { resolvePartCapability } from '~/features/events'
import { groupTemplateParts, type ListedPart } from '~/features/settings/model/schedule-template-list'
import * as m from '~/i18n/paraglide/messages'
import { getRoleDisplayName, type RoleOption } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { cn } from '~/shared/utils/utils'

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
  onAdd: (kind: ItemKind) => void
}) {
  const roleNames = (ids: number[]) =>
    roles
      .filter(role => ids.includes(role.id))
      .map(role => getRoleDisplayName(role))
      .join(', ')
  const partDetail = (part: ItemListPart) =>
    [
      roleNames(part.allowedSpeakerRoleIds) || m.settings_schedule_templates_anyone(),
      // The second slot as the part's type gives it (always without a type), as the meeting's form does.
      ...(resolvePartCapability(
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
              // biome-ignore lint/suspicious/noArrayIndexKey: two runs may share a section, apart in the order
              <div key={`${run.section ?? ''}-${index}`}>
                {inSection && (
                  <div className="flex flex-wrap items-baseline gap-x-2 border-border border-b bg-subtle px-3 py-2.5 text-xs">
                    <span className="font-semibold text-foreground text-sm">{run.section}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {[
                        ...(run.minutes > 0 ? [m.settings_schedule_templates_minutes({ minutes: run.minutes })] : []),
                        ...(run.halls.length > 1
                          ? [m.settings_schedule_templates_parallel({ count: run.halls.length })]
                          : []),
                      ].join(' · ')}
                    </span>
                  </div>
                )}
                {run.parts.map(part => partRow(part, inSection ? 'pl-6' : ''))}
                {run.halls.map(hall => (
                  <div key={hall.name}>
                    <div className="border-border border-b px-3 py-1.5 pl-6 text-muted-foreground text-xs">
                      {m.settings_schedule_templates_hall({ name: hall.name, count: hall.parts.length })}
                      {hall.minutes > 0 && ` · ${m.settings_schedule_templates_minutes({ minutes: hall.minutes })}`}
                    </div>
                    {hall.parts.map(part => partRow(part, 'pl-9'))}
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
      <AddButton label={m.settings_schedule_templates_add_part()} onClick={() => onAdd('part')} />
      <p className="text-faint text-xs">{m.settings_schedule_templates_list_note()}</p>
    </div>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="self-start" onClick={onClick}>
      <Plus aria-hidden="true" />
      {label}
    </Button>
  )
}
