import { Panel } from '@unitae/ui'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import * as m from '~/i18n/paraglide/messages'
import { getRoleDisplayName, type RoleOption } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { cn } from '~/shared/utils/utils'
import { ROW_REVEAL } from './ProgrammeRows'

export type ServicePartAssignment = {
  id: number
  name: string
  allowedRoleIds: number[]
}

interface EventServicesPanelProps {
  services: ServicePartAssignment[]
  roles: RoleOption[]
  /** The service open in the editor, highlighted. */
  selectedId: number | null
  /** Each receives the button pressed, for focus to come back to it when the editor closes. */
  onAddService: (trigger: HTMLElement) => void
  onEditService: (service: ServicePartAssignment, trigger: HTMLElement) => void
  onDeleteService: (service: { id: number; name: string }) => void
}

/** The event's services (sound, attendants…), each with the roles that may do it. */
export function EventServicesPanel({
  services,
  roles,
  selectedId,
  onAddService,
  onEditService,
  onDeleteService,
}: EventServicesPanelProps) {
  return (
    <Panel
      title={m.programs_edit_services_title()}
      actions={
        <Button variant="outline" onClick={event => onAddService(event.currentTarget)}>
          <Plus />
          {m.programs_edit_add_service_button()}
        </Button>
      }
    >
      {services.length === 0 ? (
        <p className="px-4.5 py-6 text-muted-foreground text-sm">{m.programs_edit_no_services()}</p>
      ) : (
        services.map(service => {
          const selected = service.id === selectedId
          const allowed = roles.filter(role => service.allowedRoleIds.includes(role.id))
          return (
            <div
              key={service.id}
              data-selected={selected || undefined}
              className={cn(
                'group/row flex min-h-10 items-center gap-3 border-border border-b px-4.5 transition-colors last:border-b-0 hover:bg-hover',
                selected && 'bg-selected hover:bg-selected',
              )}
            >
              <span className="min-w-0 flex-1 text-sm">{service.name}</span>
              <span className="min-w-0 truncate text-faint text-sm">
                {allowed.length === 0
                  ? m.programs_edit_publisher_default_chip()
                  : allowed.map(role => getRoleDisplayName(role)).join(', ')}
              </span>
              <span className={cn('flex flex-none gap-0.5', selected ? 'opacity-100' : ROW_REVEAL)}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-7"
                  aria-label={m.programs_edit_edit_item({ name: service.name })}
                  onClick={event => onEditService(service, event.currentTarget)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  aria-label={m.programs_edit_delete_item({ name: service.name })}
                  onClick={() => onDeleteService({ id: service.id, name: service.name })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </span>
            </div>
          )
        })
      )}
    </Panel>
  )
}
