import { Pencil, Plus, Trash2 } from 'lucide-react'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

export type ServicePartAssignment = {
  id: number
  name: string
  allowedRoleIds: number[]
}

type EventServicesCardProps = {
  services: ServicePartAssignment[]
  onAddService: () => void
  onEditService: (service: ServicePartAssignment) => void
  onDeleteService: (service: { id: number; name: string }) => void
}

export function EventServicesCard({ services, onAddService, onEditService, onDeleteService }: EventServicesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{m.programs_edit_services_title()}</CardTitle>
        <CardAction>
          <Button size="sm" onClick={onAddService}>
            <Plus className="size-4" />
            {m.programs_edit_add_service_button()}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {services.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.programs_view_role_col()}</TableHead>
                <TableHead className="w-20">{m.common_actions()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map(assignment => (
                <TableRow key={assignment.id}>
                  <TableCell className="font-medium text-sm">{assignment.name}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => onEditService(assignment)}>
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        onClick={() => onDeleteService({ id: assignment.id, name: assignment.name })}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground text-sm italic">{m.programs_edit_new_service_placeholder()}</p>
        )}
      </CardContent>
    </Card>
  )
}
