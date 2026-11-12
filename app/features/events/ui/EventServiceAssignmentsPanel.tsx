import { Panel } from '@unitae/ui'
import { UserPlus, X } from 'lucide-react'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { cn } from '~/shared/utils/utils'
import type { AssignableService } from './AssignServiceEditor'
import type { UnassignTarget } from './EventAssignmentsPanel'
import { PersonCell, type PersonName, personName } from './PersonCell'
import { ROW_REVEAL } from './ProgrammeRows'

export interface AssignedService extends AssignableService {
  assignee: PersonName | null
  hasConflict: boolean
}

interface EventServiceAssignmentsPanelProps {
  services: AssignedService[]
  /** The viewer may assign the services: a service responsible gets this without the programme. */
  canAssign: boolean
  canViewPublishers: boolean
  selectedId: number | null
  onAssign: (service: AssignedService, trigger: HTMLElement) => void
  onUnassign: (target: UnassignTarget) => void
}

/** Who does each service (sound, attendants…) at this event. */
export function EventServiceAssignmentsPanel({
  services,
  canAssign,
  canViewPublishers,
  selectedId,
  onAssign,
  onUnassign,
}: EventServiceAssignmentsPanelProps) {
  return (
    <Panel title={m.programs_view_services()}>
      {services.length === 0 ? (
        <p className="px-4.5 py-6 text-muted-foreground text-sm">{m.programs_edit_no_services()}</p>
      ) : (
        <table className="w-full table-fixed border-collapse text-sm max-md:block">
          <caption className="sr-only">{m.programs_view_services()}</caption>
          <thead className="max-md:sr-only">
            <tr className="h-8.5 border-border border-b text-left text-faint">
              <th scope="col" className="pl-4.5 font-medium">
                {m.programs_view_role_col()}
              </th>
              <th scope="col" className="w-[54%] px-3 font-medium">
                {m.programs_view_publisher_col()}
              </th>
              <th scope="col" className="w-[4.5rem] pr-4.5">
                <span className="sr-only">{m.common_actions()}</span>
              </th>
            </tr>
          </thead>
          <tbody className="max-md:block">
            {services.map(service => {
              const selected = service.id === selectedId
              const assigned = service.assignee ? personName(service.assignee) : null
              return (
                <tr
                  key={service.id}
                  data-selected={selected || undefined}
                  className={cn(
                    'group/row border-border border-b transition-colors last:border-b-0 hover:bg-hover',
                    'max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-1.5 max-md:px-4.5 max-md:py-2.5',
                    selected && 'bg-selected hover:bg-selected',
                  )}
                >
                  <td className="h-11 truncate py-1.5 pl-4.5 max-md:order-1 max-md:h-auto max-md:p-0">
                    {service.name}
                  </td>
                  <td className="px-3 max-md:order-3 max-md:col-span-2 max-md:p-0">
                    <PersonCell
                      person={service.assignee}
                      personId={service.assigneeId}
                      conflict={service.hasConflict}
                      linkToPublisher={canViewPublishers}
                      onAssign={canAssign ? trigger => onAssign(service, trigger) : undefined}
                    />
                  </td>
                  <td className="pr-4.5 max-md:order-2 max-md:p-0">
                    <div
                      className={cn(
                        'flex justify-end gap-0.5 pointer-coarse:gap-2',
                        selected ? 'opacity-100' : ROW_REVEAL,
                      )}
                    >
                      {canAssign && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-7"
                            aria-label={m.programs_view_assign_item({ name: service.name })}
                            onClick={event => onAssign(service, event.currentTarget)}
                          >
                            <UserPlus className="size-3.5" />
                          </Button>
                          {assigned && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              aria-label={m.programs_view_unassign_item({ name: service.name })}
                              onClick={() =>
                                onUnassign({
                                  type: 'service',
                                  id: service.id,
                                  name: service.name,
                                  assigneeName: assigned,
                                })
                              }
                            >
                              <X className="size-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Panel>
  )
}
