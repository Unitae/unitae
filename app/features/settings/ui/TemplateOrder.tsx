import {
  type Announcements,
  type CollisionDetection,
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
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
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { cn } from '~/shared/utils/utils'

/** How a schedule template's parts and sections move: by a handle, dragged, or up and down (« Réorganiser »). */
export interface OrderControls {
  mode: 'drag' | 'buttons'
  /** A top item (a part outside any section, or a section) from its place to another. */
  top: (from: number, to: number, name: string) => void
  /** A part within its group (its section's parts outside any hall, or its hall), from its place there to another. */
  group: (partId: number, from: number, to: number, name: string) => void
}

/** The ids the drag knows: `top:…` for the top items, `in:<part id>` for a part within its group. */
export const topId = (key: string) => `top:${key}`
export const inId = (partId: number) => `in:${partId}`

/**
 * The top list holds rows and whole sections, of very different heights: matched by centre, a section moved by one
 * place stays closer to where it was. Matched by the nearest top or bottom edge, it lands where the move put its edge.
 */
const closestEdge: CollisionDetection = ({ collisionRect, droppableRects, droppableContainers }) =>
  droppableContainers
    .flatMap(container => {
      const rect = droppableRects.get(container.id)
      if (rect == null) return []
      const value = Math.min(
        Math.abs(rect.top - collisionRect.top),
        Math.abs(rect.top + rect.height - (collisionRect.top + collisionRect.height)),
      )
      return [{ id: container.id, data: { droppableContainer: container, value } }]
    })
    .sort((a, b) => a.data.value - b.data.value)

/** What a drag says of what it moves: a part or a section by default (feminine in French), a service otherwise. */
export interface DragWords {
  picked: (name: string) => string
  dropped: (name: string) => string
}

const PART_WORDS: DragWords = {
  picked: name => m.settings_schedule_templates_drag_picked({ name }),
  dropped: name => m.settings_schedule_templates_drag_dropped({ name }),
}

function useOrderDrag(names: ReadonlyMap<string, string>, words: DragWords = PART_WORDS) {
  // Stable across server and client render, or the handles' descriptions fail hydration.
  const id = useId()
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, scrollBehavior: 'instant' }),
  )
  const nameOf = (item: UniqueIdentifier) => names.get(String(item)) ?? ''
  const announcements: Announcements = {
    onDragStart: ({ active }) => words.picked(nameOf(active.id)),
    onDragOver: () => undefined,
    onDragEnd: ({ active }) => words.dropped(nameOf(active.id)),
    onDragCancel: ({ active }) => m.settings_schedule_templates_drag_cancelled({ name: nameOf(active.id) }),
  }
  return {
    id,
    sensors,
    nameOf,
    accessibility: {
      announcements,
      screenReaderInstructions: { draggable: m.settings_schedule_templates_drag_instructions() },
    },
  }
}

/**
 * The top of the parts' list (the parts outside any section, and the sections), draggable with the pointer or the
 * keyboard (Space, the arrows, Space). Each section's groups drag in their own area: a drag only meets its own list.
 */
export function OrderArea({
  controls,
  topIds,
  names,
  words,
  children,
}: {
  /** Nothing moves without them (the drag is off); the rows' sortables still need the area around them. */
  controls: OrderControls | null
  topIds: string[]
  /** What each id is called, for the announcements and the moves. */
  names: ReadonlyMap<string, string>
  /** What the drag says (a service's words, masculine in French); a part's by default. */
  words?: DragWords
  children: ReactNode
}) {
  const { id, sensors, nameOf, accessibility } = useOrderDrag(names, words)
  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestEdge}
      accessibility={accessibility}
      onDragEnd={({ active, over }) => {
        if (controls == null || over == null || active.id === over.id) return
        controls.top(topIds.indexOf(String(active.id)), topIds.indexOf(String(over.id)), nameOf(active.id))
      }}
    >
      <SortableContext items={topIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

/** A group of a section (its parts outside any hall, or a hall): its parts move among themselves, in an area of their own. */
export function GroupArea({
  controls,
  partIds,
  names,
  children,
}: {
  controls: OrderControls | null
  partIds: number[]
  names: ReadonlyMap<string, string>
  children: ReactNode
}) {
  const { id, sensors, nameOf, accessibility } = useOrderDrag(names)
  const ids = partIds.map(inId)
  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={accessibility}
      onDragEnd={({ active, over }) => {
        if (controls == null || over == null || active.id === over.id) return
        const moving = String(active.id)
        controls.group(Number(moving.slice(3)), ids.indexOf(moving), ids.indexOf(String(over.id)), nameOf(moving))
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

/**
 * One thing that moves: its handle (a grip to drag, or « Monter » and « Descendre ») is handed to what draws it, to
 * put where its row wants it.
 */
export function Movable({
  id,
  index,
  count,
  labels,
  controls,
  onMove,
  children,
}: {
  id: string
  index: number
  count: number
  labels: { drag: string; up: string; down: string }
  controls: OrderControls | null
  onMove: (to: number) => void
  children: (handle: ReactNode) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: controls?.mode !== 'drag',
  })
  // The button just pressed, so focus can follow the move: to the other one once it reaches an end and disables.
  const pressed = useRef<'up' | 'down' | null>(null)
  const up = useRef<HTMLButtonElement>(null)
  const down = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (pressed.current == null) return
    const target = index === 0 ? down : index === count - 1 ? up : pressed.current === 'up' ? up : down
    pressed.current = null
    target.current?.focus()
  }, [index, count])
  const press = (direction: 'up' | 'down') => {
    pressed.current = direction
    onMove(direction === 'up' ? index - 1 : index + 1)
  }
  const handle =
    controls == null ? null : controls.mode === 'drag' ? (
      <button
        type="button"
        aria-label={labels.drag}
        className="flex w-8 flex-none cursor-grab touch-none items-center justify-center text-faint outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </button>
    ) : (
      <span className="flex flex-none items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11"
          ref={up}
          aria-label={labels.up}
          disabled={index === 0}
          onClick={() => press('up')}
        >
          <ChevronUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11"
          ref={down}
          aria-label={labels.down}
          disabled={index === count - 1}
          onClick={() => press('down')}
        >
          <ChevronDown aria-hidden="true" />
        </Button>
      </span>
    )
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('bg-surface', isDragging && 'relative z-10 opacity-60')}
    >
      {children(handle)}
    </div>
  )
}
