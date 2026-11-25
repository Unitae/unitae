import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { resolvePartCapability } from '~/features/events'
import {
  groupTemplateParts,
  hallPartDraft,
  newHallDraft,
  type PartDraft,
  sectionPartDraft,
  topItems,
} from '~/features/settings/model/schedule-template-list'
import * as m from '~/i18n/paraglide/messages'
import { getRoleDisplayName, type RoleOption } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { cn } from '~/shared/utils/utils'
import { PartGroupHeader } from './PartGroupHeader'
import type { ItemListPart } from './ScheduleTemplateItemList'
import { GroupArea, inId, Movable, OrderArea, type OrderControls, topId } from './TemplateOrder'

const rowClass =
  'flex min-w-0 flex-1 min-h-12 items-center gap-3 px-3 py-1.5 text-left text-sm outline-none transition-colors duration-(--u-duration-fast) hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
const detailClass = 'block truncate text-faint text-xs'

/** The `data-item` mark of a part's row, where focus goes back after its form closes. */
const partMark = (id: number) => `part-${id}`

/**
 * A programme template's parts as the list draws them: by section, a section's halls nested, with the times. Each
 * part outside any section and each section moves at the top, each part within its group, by `controls`; with
 * « Réorganiser » (`controls.mode === 'buttons'`) the rows only move, nothing opens or is added.
 */
export function TemplatePartRuns({
  parts,
  roles,
  presets,
  sections,
  lastOrder,
  controls,
  onOpen,
  onAdd,
}: {
  parts: ItemListPart[]
  roles: RoleOption[]
  presets: {
    id: number
    speakerLabel: string | null
    readerLabel: string | null
    hasReaderSlot: boolean
    allowExternalSpeaker: boolean
  }[]
  /** The template's sections: a rename may not take another's name. */
  sections: string[]
  lastOrder: number
  controls: OrderControls | null
  onOpen: (id: number) => void
  onAdd: (draft: PartDraft) => void
}) {
  const { runs, total } = groupTemplateParts(parts)
  const tops = topItems(parts)
  const topKeys = tops.map(item => topId(item.kind === 'part' ? `part:${item.id}` : `section:${item.run}`))
  const reordering = controls?.mode === 'buttons'
  const names = new Map<string, string>()
  for (const [index, item] of tops.entries()) {
    names.set(
      topKeys[index] ?? '',
      item.kind === 'part' ? (parts.find(p => p.id === item.id)?.name ?? '') : item.section,
    )
  }
  const partName = (part: ItemListPart) =>
    part.track === '' ? part.name : m.settings_schedule_templates_part_in_hall({ name: part.name, hall: part.track })
  for (const part of parts) names.set(inId(part.id), partName(part))

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

  const partRow = (part: ItemListPart, indent: string, handle: ReactNode) => {
    const body = (
      <>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{part.name}</span>
          <span className={detailClass}>{partDetail(part)}</span>
        </span>
        <span className={cn('w-14 flex-none text-right tabular-nums', part.durationMin == null && 'text-faint')}>
          {part.durationMin == null ? '—' : m.settings_schedule_templates_minutes({ minutes: part.durationMin })}
        </span>
      </>
    )
    return (
      <div className={cn('flex items-stretch border-border border-b', handle == null && indent)}>
        {handle != null && <span className={cn('flex', indent)}>{handle}</span>}
        {reordering ? (
          <div className={rowClass}>{body}</div>
        ) : (
          <button type="button" data-item={partMark(part.id)} onClick={() => onOpen(part.id)} className={rowClass}>
            {body}
          </button>
        )}
      </div>
    )
  }
  const movablePart = (part: ItemListPart, group: ItemListPart[], index: number, indent: string) => (
    <Movable
      key={part.id}
      id={inId(part.id)}
      index={index}
      count={group.length}
      controls={controls}
      labels={{
        drag: m.settings_schedule_templates_move_part({ name: partName(part) }),
        up: m.settings_schedule_templates_move_up({ name: partName(part) }),
        down: m.settings_schedule_templates_move_down({ name: partName(part) }),
      }}
      onMove={to => controls?.group(part.id, index, to, partName(part))}
    >
      {handle => partRow(part, indent, handle)}
    </Movable>
  )
  const addPart = (label: string, draft: PartDraft) =>
    reordering ? null : (
      <div className="flex min-h-10 items-center border-border border-b px-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          aria-label={m.settings_schedule_templates_add_part_to({ name: label })}
          onClick={() => onAdd(draft)}
        >
          <Plus aria-hidden="true" />
          {m.settings_schedule_templates_part_short()}
        </Button>
      </div>
    )

  let top = 0
  const content = runs.map((run, index) => {
    if (run.section == null) {
      return run.parts.map(part => {
        const at = top++
        return (
          <Movable
            key={part.id}
            id={topKeys[at] ?? ''}
            index={at}
            count={topKeys.length}
            controls={controls}
            labels={{
              drag: m.settings_schedule_templates_move_part({ name: part.name }),
              up: m.settings_schedule_templates_move_up({ name: part.name }),
              down: m.settings_schedule_templates_move_down({ name: part.name }),
            }}
            onMove={to => controls?.top(at, to, part.name)}
          >
            {handle => partRow(part, '', handle)}
          </Movable>
        )
      })
    }
    const at = top++
    const section = run.section
    return (
      <Movable
        // biome-ignore lint/suspicious/noArrayIndexKey: by place, so a renamed section keeps its header (focus, refusal)
        key={`section-${index}`}
        id={topKeys[at] ?? ''}
        index={at}
        count={topKeys.length}
        controls={controls}
        labels={{
          drag: m.settings_schedule_templates_move_section({ name: section }),
          up: m.settings_schedule_templates_move_section_up({ name: section }),
          down: m.settings_schedule_templates_move_section_down({ name: section }),
        }}
        onMove={to => controls?.top(at, to, section)}
      >
        {handle => (
          <>
            <PartGroupHeader
              level="section"
              name={section}
              handle={handle}
              readOnly={reordering}
              taken={sections.filter(each => each !== section)}
              meta={[
                ...(run.minutes > 0 ? [m.settings_schedule_templates_minutes({ minutes: run.minutes })] : []),
                ...(run.halls.length > 1 ? [m.settings_schedule_templates_parallel({ count: run.halls.length })] : []),
              ].join(' · ')}
              onAddHall={() =>
                onAdd(
                  newHallDraft(run, lastOrder, {
                    second: m.settings_schedule_templates_second_hall(),
                    nth: number => m.settings_schedule_templates_nth_hall({ number }),
                  }),
                )
              }
            />
            <GroupArea controls={controls} names={names} partIds={run.parts.map(part => part.id)}>
              {run.parts.map((part, partIndex) => movablePart(part, run.parts, partIndex, 'pl-6'))}
            </GroupArea>
            {run.halls.length === 0 && addPart(section, sectionPartDraft(run, lastOrder))}
            {run.halls.map((hall, hallIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: by place, so a renamed hall keeps its header
              <div key={hallIndex}>
                <PartGroupHeader
                  level="hall"
                  name={hall.name}
                  readOnly={reordering}
                  taken={run.halls.map(each => each.name).filter(each => each !== hall.name)}
                  section={section}
                  meta={[
                    m.programs_new_parts({ count: hall.parts.length }),
                    ...(hall.minutes > 0 ? [m.settings_schedule_templates_minutes({ minutes: hall.minutes })] : []),
                  ].join(' · ')}
                />
                <GroupArea controls={controls} names={names} partIds={hall.parts.map(part => part.id)}>
                  {hall.parts.map((part, partIndex) => movablePart(part, hall.parts, partIndex, 'pl-9'))}
                </GroupArea>
                {addPart(hall.name, hallPartDraft(run, hall, lastOrder))}
              </div>
            ))}
          </>
        )}
      </Movable>
    )
  })

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <OrderArea controls={controls} topIds={topKeys} names={names}>
        {content}
      </OrderArea>
      <div className="flex flex-wrap justify-between gap-x-3 bg-subtle px-3 py-2 text-faint text-xs tabular-nums">
        <span>{m.settings_schedule_templates_total({ count: total.count, minutes: total.minutes })}</span>
        {total.withoutDuration > 0 && (
          <span>{m.settings_schedule_templates_without_duration({ count: total.withoutDuration })}</span>
        )}
      </div>
    </div>
  )
}
