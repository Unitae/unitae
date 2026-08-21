import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Clock, Pencil, Plus, Trash2 } from 'lucide-react'
import { Fragment } from 'react'
import { SortableRow } from '~/features/events/ui/SortableRow'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

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

function groupPartsBySection(parts: PartAssignment[]): { section: string; parts: PartAssignment[] }[] {
  const groups: { section: string; parts: PartAssignment[] }[] = []
  let currentSection: string | null = null
  for (const part of parts) {
    const section = part.section || ''
    if (section !== currentSection) {
      groups.push({ section, parts: [] })
      currentSection = section
    }
    groups.at(-1)?.parts.push(part)
  }
  return groups
}

type EventPartsCardProps = {
  parts: PartAssignment[]
  templates: { id: number; name: string }[]
  selectedTemplateId: string
  onTemplateChange: (id: string) => void
  onApplyTemplate: () => void
  isApplyingTemplate: boolean
  onAddPart: () => void
  onEditPart: (part: PartAssignment) => void
  onDeletePart: (part: { id: number; name: string }) => void
  onDragEnd: (event: DragEndEvent) => void
}

export function EventPartsCard({
  parts,
  templates,
  selectedTemplateId,
  onTemplateChange,
  onApplyTemplate,
  isApplyingTemplate,
  onAddPart,
  onEditPart,
  onDeletePart,
  onDragEnd,
}: EventPartsCardProps) {
  const partsBySection = groupPartsBySection(parts)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{m.programs_edit_spiritual_program()}</CardTitle>
        <CardAction>
          <div className="flex items-center gap-2">
            {templates.length > 0 && (
              <div className="flex items-center gap-1">
                <Select value={selectedTemplateId} onValueChange={onTemplateChange}>
                  <SelectTrigger className="h-8 w-40 text-xs">
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
                  size="sm"
                  onClick={onApplyTemplate}
                  disabled={!selectedTemplateId || isApplyingTemplate}
                >
                  {m.programs_edit_apply_button()}
                </Button>
              </div>
            )}
            <Button size="sm" onClick={onAddPart}>
              <Plus className="size-4" />
              {m.programs_edit_add_part_button()}
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {parts.length > 0 ? (
          <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={parts.map(p => p.id)} strategy={verticalListSortingStrategy}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>{m.programs_view_part_col()}</TableHead>
                    <TableHead className="w-24">{m.programs_view_duration_col()}</TableHead>
                    <TableHead className="w-20">{m.common_actions()}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partsBySection.map((group, groupIdx) => (
                    <Fragment key={`section-${group.section || groupIdx}`}>
                      {group.section && (
                        <TableRow className="bg-muted/50">
                          <TableCell colSpan={4} className="py-1.5">
                            <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                              {group.section}
                            </span>
                          </TableCell>
                        </TableRow>
                      )}
                      {group.parts.map(assignment => (
                        <SortableRow key={assignment.id} id={assignment.id}>
                          <TableCell>
                            <span className="font-medium text-sm">{assignment.name}</span>
                          </TableCell>
                          <TableCell>
                            {assignment.durationMin ? (
                              <span className="flex items-center gap-1 text-muted-foreground text-sm">
                                <Clock className="size-3" />
                                {assignment.durationMin} min
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => onEditPart(assignment)}
                              >
                                <Pencil className="size-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-destructive hover:text-destructive"
                                onClick={() => onDeletePart({ id: assignment.id, name: assignment.name })}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </SortableRow>
                      ))}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="text-muted-foreground text-sm">{m.programs_edit_apply_template_hint()}</p>
        )}
      </CardContent>
    </Card>
  )
}
