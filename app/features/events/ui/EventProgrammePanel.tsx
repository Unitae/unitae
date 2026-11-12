import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Panel } from '@unitae/ui'
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { Fragment, useId } from 'react'
import { groupProgrammeParts, summarizeDurations } from '~/features/events/model/programme-grouping'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { cn } from '~/shared/utils/utils'
import { durationLabel, ProgrammeSectionHead, ProgrammeTrackHead, ROW_REVEAL } from './ProgrammeRows'

export type PartAssignment = {
  id: number
  name: string
  section: string
  track: string
  trackOrder: number | null
  order: number
  durationMin: number | null
  allowExternalSpeaker: boolean
  // Which kind of assignment this is. Settable per event, not only per
  // template: the ministry parts are a different kind every week.
  presetId: number | null
  allowedSpeakerRoleIds: number[]
  allowedReaderRoleIds: number[]
}

export function reorderPartIds(ids: number[], activeId: number, overId: number): number[] {
  if (activeId === overId) return ids
  const oldIndex = ids.indexOf(activeId)
  const newIndex = ids.indexOf(overId)
  if (oldIndex === -1 || newIndex === -1) return ids
  const reordered = [...ids]
  const [moved] = reordered.splice(oldIndex, 1)
  reordered.splice(newIndex, 0, moved)
  return reordered
}

interface EventProgrammePanelProps {
  parts: PartAssignment[]
  /** Part kinds by id, to name a part's kind after its name. */
  presetNames: Map<number, string>
  templates: { id: number; name: string }[]
  selectedTemplateId: string
  onTemplateChange: (id: string) => void
  onApplyTemplate: () => void
  isApplyingTemplate: boolean
  /** The part open in the editor, highlighted. */
  selectedId: number | null
  /** Parts cannot move while the open part has unsaved changes: a move would reset its order field. */
  dragLocked: boolean
  /** Each receives the button pressed, for focus to come back to it when the editor closes. */
  onAddPart: (trigger: HTMLElement) => void
  onEditPart: (part: PartAssignment, trigger: HTMLElement) => void
  onDeletePart: (part: { id: number; name: string }) => void
  onDragEnd: (event: DragEndEvent) => void
  /** Shown to someone who may only look: no adding, moving, editing or deleting. */
  readOnly?: boolean
  /** What the panel says while it holds no part. */
  emptyHint?: string
}

export function EventProgrammePanel({
  parts,
  presetNames,
  templates,
  selectedTemplateId,
  onTemplateChange,
  onApplyTemplate,
  isApplyingTemplate,
  selectedId,
  dragLocked,
  onAddPart,
  onEditPart,
  onDeletePart,
  onDragEnd,
  readOnly = false,
  emptyHint,
}: EventProgrammePanelProps) {
  const sections = groupProgrammeParts(parts)
  const total = summarizeDurations(parts)
  // Stable across server and client render, or the drag handles' descriptions fail hydration.
  const dndId = useId()
  // Arrow keys move a part to the next part, across section and room headings, instead of by a fixed distance.
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, scrollBehavior: 'instant' }),
  )

  return (
    <Panel
      title={m.programs_edit_spiritual_program()}
      actions={
        !readOnly && (
          <>
            {templates.length > 0 && (
              <>
                <Select value={selectedTemplateId} onValueChange={onTemplateChange}>
                  <SelectTrigger className="w-[220px] max-w-full" aria-label={m.programs_edit_select_template()}>
                    <SelectValue placeholder={m.programs_edit_select_template()} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(template => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={onApplyTemplate}
                  disabled={!selectedTemplateId || isApplyingTemplate}
                >
                  {m.programs_edit_apply_button()}
                </Button>
              </>
            )}
            <Button onClick={event => onAddPart(event.currentTarget)}>
              <Plus />
              {m.programs_edit_add_part_button()}
            </Button>
          </>
        )
      }
      footer={
        parts.length > 0 && (
          <>
            <span>
              {parts.length === 1
                ? m.programs_edit_parts_one()
                : m.programs_edit_parts_many({ count: String(parts.length) })}
            </span>
            <span className="tabular-nums">{durationLabel(total, true)}</span>
          </>
        )
      }
    >
      {parts.length === 0 ? (
        <p className="px-4.5 py-6 text-muted-foreground text-sm">
          {emptyHint ?? m.programs_edit_apply_template_hint()}
        </p>
      ) : (
        <>
          <div
            aria-hidden="true"
            className="flex h-8.5 items-center gap-3 border-border border-b px-4.5 font-medium text-faint text-sm"
          >
            <span className="w-4" />
            <span className="flex-1">{m.programs_view_part_col()}</span>
            <span className="w-[70px] text-right max-sm:hidden">{m.programs_view_duration_col()}</span>
            <span className="w-16" />
          </div>
          <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={parts.map(part => part.id)} strategy={verticalListSortingStrategy}>
              {sections.map((section, index) => (
                <Fragment key={`section-${section.section || index}`}>
                  {section.section && (
                    <ProgrammeSectionHead
                      section={section.section}
                      parts={section.tracks.flatMap(track => track.parts)}
                    />
                  )}
                  {section.tracks.map(track => {
                    const named = track.track !== ''
                    return (
                      <Fragment key={`track-${track.parts[0]?.id ?? track.track}`}>
                        {named && <ProgrammeTrackHead track={track.track} count={track.parts.length} />}
                        {track.parts.map(part => (
                          <PartRow
                            key={part.id}
                            part={part}
                            kind={part.presetId != null ? presetNames.get(part.presetId) : undefined}
                            indented={named}
                            selected={part.id === selectedId}
                            dragLocked={dragLocked || readOnly}
                            readOnly={readOnly}
                            onEdit={trigger => onEditPart(part, trigger)}
                            onDelete={() => onDeletePart({ id: part.id, name: part.name })}
                          />
                        ))}
                      </Fragment>
                    )
                  })}
                </Fragment>
              ))}
            </SortableContext>
          </DndContext>
        </>
      )}
    </Panel>
  )
}

interface PartRowProps {
  part: PartAssignment
  /** The part's kind, named after it only when it says something the name does not. */
  kind: string | undefined
  indented: boolean
  selected: boolean
  dragLocked: boolean
  readOnly: boolean
  onEdit: (trigger: HTMLElement) => void
  onDelete: () => void
}

function PartRow({ part, kind, indented, selected, dragLocked, readOnly, onEdit, onDelete }: PartRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: part.id,
    disabled: dragLocked,
  })
  const showKind = kind != null && kind.toLocaleLowerCase(getLocale()) !== part.name.toLocaleLowerCase(getLocale())

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-selected={selected || undefined}
      data-sortable=""
      className={cn(
        'group/row relative flex min-h-10 items-center gap-3 border-border border-b bg-surface pr-4.5 pl-4.5 transition-colors last:border-b-0 hover:bg-hover',
        indented && 'pl-11',
        selected && 'bg-selected hover:bg-selected',
        isDragging && 'z-10 opacity-60',
      )}
    >
      {readOnly ? (
        <span className="w-4 flex-none" />
      ) : (
        <button
          type="button"
          aria-label={m.programs_edit_move_item({ name: part.name })}
          title={dragLocked ? m.programs_edit_move_locked() : undefined}
          className={cn(
            'flex-none touch-none rounded text-faint outline-none focus-visible:ring-2 focus-visible:ring-ring',
            dragLocked ? 'cursor-not-allowed' : 'cursor-grab',
            ROW_REVEAL,
          )}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      <span className="min-w-0 flex-1 text-sm">
        {part.name}
        {showKind && <span className="text-faint"> · {kind}</span>}
      </span>
      <span className="inline-flex w-[70px] flex-none items-center justify-end gap-1.5 text-muted-foreground text-sm tabular-nums max-sm:hidden">
        {part.durationMin != null ? (
          m.programme_section_total_min({ minutes: String(part.durationMin) })
        ) : (
          <>
            <span aria-hidden="true" className="text-faint">
              —
            </span>
            <span className="sr-only">{m.programs_edit_no_duration()}</span>
          </>
        )}
      </span>
      <span
        className={cn(
          // On a touch screen the buttons are 44 px apart from each other: the slot grows with them.
          'flex w-16 flex-none justify-end gap-0.5 pointer-coarse:w-auto pointer-coarse:gap-2',
          readOnly && 'invisible',
          selected ? 'opacity-100' : ROW_REVEAL,
        )}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7"
          aria-label={m.programs_edit_edit_item({ name: part.name })}
          onClick={event => onEdit(event.currentTarget)}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7 text-muted-foreground hover:text-destructive"
          aria-label={m.programs_edit_delete_item({ name: part.name })}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </span>
    </div>
  )
}
