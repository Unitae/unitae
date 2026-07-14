import { Pencil, Plus } from 'lucide-react'
import { Link } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { TableCell, TableRow } from '~/shared/ui/table'

export interface PublisherActivityRowData {
  id: number
  firstname: string
  lastname: string | null
  publisherGroup: { id: number; name: string } | null
  wasInactive: boolean
  notRegular: boolean
  lastActivity: {
    id: number
    isPublisher: boolean
    hours: number | null
    studies: number
    type: PublisherType
    notes: string
  } | null
  editActivityUrl: string
  newActivityUrl: string
}

interface PublisherActivityRowProps {
  publisher: PublisherActivityRowData
  canManageActivities: boolean
}

export function PublisherActivityRow({ publisher, canManageActivities }: PublisherActivityRowProps) {
  const nameHover = publisher.wasInactive ? 'hover:text-foreground' : 'hover:text-primary'
  return (
    <TableRow
      key={publisher.id}
      className={
        publisher.wasInactive
          ? 'bg-muted/40 text-muted-foreground'
          : publisher.notRegular
            ? 'bg-destructive/10 text-destructive dark:bg-destructive/5'
            : ''
      }
    >
      <TableCell className="text-center max-sm:text-left">
        <div className="flex items-center justify-center gap-2 max-sm:justify-start">
          <Link to={`/publishers/${publisher.id}/view`} className={nameHover}>
            {publisher.firstname}
          </Link>
          {publisher.wasInactive && (
            <Badge variant="outline" className="text-xs">
              {m.activity_table_inactive()}
            </Badge>
          )}
          {!publisher.wasInactive && publisher.notRegular && (
            <Badge variant="destructive" className="text-xs">
              {m.activity_table_irregular()}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-center">
        <Link to={`/publishers/${publisher.id}/view`} className={nameHover}>
          {publisher.lastname?.toLocaleUpperCase()}
        </Link>
      </TableCell>
      <TableCell className="text-center">
        {publisher.publisherGroup != null && (
          <Link to={`/groups/${publisher.publisherGroup.id}/edit`} className={nameHover}>
            {publisher.publisherGroup.name.toLocaleUpperCase()}
          </Link>
        )}
      </TableCell>

      <ActivityColumns publisher={publisher} />

      {canManageActivities && (
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            {publisher.lastActivity != null && (
              <Button asChild variant="ghost" size="icon">
                <Link to={publisher.editActivityUrl}>
                  <Pencil className="size-4" />
                </Link>
              </Button>
            )}
            {publisher.lastActivity == null && (
              <Button asChild variant="ghost" size="icon">
                <Link to={publisher.newActivityUrl}>
                  <Plus className="size-4" />
                </Link>
              </Button>
            )}
          </div>
        </TableCell>
      )}
    </TableRow>
  )
}

function ActivityColumns({ publisher }: { publisher: PublisherActivityRowData }) {
  if (publisher.lastActivity == null) {
    return (
      <TableCell className="text-center text-muted-foreground text-sm italic max-sm:hidden" colSpan={4}>
        {m.activity_no_report()}
      </TableCell>
    )
  }

  return (
    <>
      <TableCell className="text-center max-sm:hidden">
        {publisher.lastActivity.type === PublisherType.Normal &&
          publisher.lastActivity.isPublisher &&
          m.activity_preached()}
        {publisher.lastActivity.type !== PublisherType.Normal && `${publisher.lastActivity?.hours}h`}
      </TableCell>
      <TableCell className="text-center max-sm:hidden">{publisher.lastActivity?.studies}</TableCell>
      <TableCell className="text-center max-sm:hidden">
        {publisher.lastActivity?.type === PublisherType.PionnierAuxiliaires && 'PA'}
        {publisher.lastActivity?.type === PublisherType.PionnierPermanant && 'PP'}
        {publisher.lastActivity?.type === PublisherType.PionnierSpecial && 'PS'}
        {publisher.lastActivity?.type === PublisherType.Missionnaire && 'M'}
        {publisher.lastActivity?.type === PublisherType.Normal && '-'}
      </TableCell>
      <TableCell className="text-center max-sm:hidden">
        {publisher.lastActivity?.notes.length < 1 ? '-' : publisher.lastActivity?.notes}
      </TableCell>
    </>
  )
}
