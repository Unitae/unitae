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
import { useId } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { getRoleDisplayName, type RoleOption } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { cn } from '~/shared/utils/utils'
import { ROW_REVEAL } from './ProgrammeRows'

export type ServicePartAssignment = {
  id: number
  name: string
  allowedRoleIds: number[]
  /** The duties schedule it is in: a meeting may hold several. */
  scheduleId?: number | null
}

interface EventServicesPanelProps {
  /** In their order: dragging one posts the new order, and the list follows once it is saved. */
  services: ServicePartAssignment[]
  roles: RoleOption[]
  /** The service open in the editor, highlighted. */
  selectedId: number | null
  /** Each receives the button pressed, for focus to come back to it when the editor closes. */
  onAddService: (trigger: HTMLElement) => void
  onEditService: (service: ServicePartAssignment, trigger: HTMLElement) => void
  onDeleteService: (service: { id: number; name: string }) => void
  onDragEnd: (event: DragEndEvent) => void
  /** Shown to someone who may only look: no adding, moving, editing or deleting. */
  readOnly?: boolean
}

/** The event's services (sound, attendants…), each with the roles that may do it, dragged to reorder. */
export function EventServicesPanel({
  services,
  roles,
  selectedId,
  onAddService,
  onEditService,
  onDeleteService,
  onDragEnd,
  readOnly = false,
}: EventServicesPanelProps) {
  // Stable across server and client render, or the drag handles' descriptions fail hydration.
  const dndId = useId()
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, scrollBehavior: 'instant' }),
  )

  return (
    <Panel
      title={m.programs_edit_services_title()}
      actions={
        !readOnly && (
          <Button variant="outline" onClick={event => onAddService(event.currentTarget)}>
            <Plus />
            {m.programs_edit_add_service_button()}
          </Button>
        )
      }
    >
      {services.length === 0 ? (
        <p className="px-4.5 py-6 text-muted-foreground text-sm">{m.programs_edit_no_services()}</p>
      ) : (
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={services.map(service => service.id)} strategy={verticalListSortingStrategy}>
            {services.map(service => (
              <ServiceRow
                key={service.id}
                service={service}
                allowed={roles.filter(role => service.allowedRoleIds.includes(role.id))}
                selected={service.id === selectedId}
                readOnly={readOnly}
                onEdit={trigger => onEditService(service, trigger)}
                onDelete={() => onDeleteService({ id: service.id, name: service.name })}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
    </Panel>
  )
}

interface ServiceRowProps {
  service: ServicePartAssignment
  allowed: RoleOption[]
  selected: boolean
  readOnly: boolean
  onEdit: (trigger: HTMLElement) => void
  onDelete: () => void
}

function ServiceRow({ service, allowed, selected, readOnly, onEdit, onDelete }: ServiceRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: service.id,
    disabled: readOnly,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-selected={selected || undefined}
      data-sortable=""
      className={cn(
        'group/row relative flex min-h-10 items-center gap-3 border-border border-b bg-surface px-4.5 transition-colors last:border-b-0 hover:bg-hover',
        selected && 'bg-selected hover:bg-selected',
        isDragging && 'z-10 opacity-60',
      )}
    >
      {readOnly ? (
        <span className="w-4 flex-none" />
      ) : (
        <button
          type="button"
          aria-label={m.programs_edit_move_item({ name: service.name })}
          className={cn(
            'flex-none cursor-grab touch-none rounded text-faint outline-none focus-visible:ring-2 focus-visible:ring-ring',
            ROW_REVEAL,
          )}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      <span className="min-w-0 flex-1 text-sm">{service.name}</span>
      <span className="min-w-0 truncate text-faint text-sm">
        {allowed.length === 0
          ? m.programs_edit_publisher_default_chip()
          : allowed.map(role => getRoleDisplayName(role)).join(', ')}
      </span>
      <span
        className={cn(
          'flex flex-none gap-0.5 pointer-coarse:gap-2',
          readOnly && 'hidden',
          selected ? 'opacity-100' : ROW_REVEAL,
        )}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7"
          aria-label={m.programs_edit_edit_item({ name: service.name })}
          onClick={event => onEdit(event.currentTarget)}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7 text-muted-foreground hover:text-destructive"
          aria-label={m.programs_edit_delete_item({ name: service.name })}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </span>
    </div>
  )
}
