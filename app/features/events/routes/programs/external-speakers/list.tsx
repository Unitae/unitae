import { ArchiveRestore, Eye, Mail, Pencil, Phone, UserPlus, UsersRound } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { listExternalSpeakers } from '~/features/events/server/external-speakers.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SearchInput } from '~/shared/ui/SearchInput'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.external_speakers_page_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManage = permissions.has(Permission.ExternalSpeakerManager)
  const canView = canManage || permissions.has(Permission.ExternalSpeakerViewer)

  if (!canView) {
    logger.warn(`Tried to load external speakers. User ID: ${currentUser.id}. Does NOT have rights.`)
    throw redirect('/')
  }

  const url = new URL(request.url)
  const search = url.searchParams.get('q')?.trim() || undefined
  const showArchived = url.searchParams.get('showArchived') === 'on'

  return withScopeFromContext(context, async db => {
    const speakers = await listExternalSpeakers(db, currentUser.congregationId, {
      search,
      includeArchived: showArchived,
    })

    return {
      speakers: speakers
        .slice()
        .sort((a, b) => {
          const aTime = a.lastVisitDate?.getTime() ?? -Infinity
          const bTime = b.lastVisitDate?.getTime() ?? -Infinity
          if (aTime === bTime) return a.name.localeCompare(b.name, 'fr')
          return aTime - bTime
        })
        .map(s => ({
          id: s.id,
          name: s.name,
          congregationName: s.congregationName,
          phone: s.phone,
          email: s.email,
          archivedAt: s.archivedAt?.toISOString() ?? null,
          lastVisitDate: s.lastVisitDate?.toISOString() ?? null,
        })),
      showArchived,
      canManage,
    }
  })
}

function formatRelative(dateString: string | null): string {
  if (!dateString) return m.external_speakers_last_visit_never()
  const months = Math.floor((Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24 * 30))
  if (months < 1) return m.external_speakers_last_visit_relative({ time: '< 1 mois' })
  if (months < 12) return m.external_speakers_last_visit_relative({ time: `${months} mois` })
  const years = Math.floor(months / 12)
  return m.external_speakers_last_visit_relative({ time: `${years} an${years > 1 ? 's' : ''}` })
}

export default function ExternalSpeakerListPage({ loaderData }: Route.ComponentProps) {
  const { speakers, showArchived, canManage } = loaderData

  const newAction = canManage ? (
    <Button asChild>
      <Link to="./new">
        <UserPlus className="size-4" />
        {m.external_speakers_new_action()}
      </Link>
    </Button>
  ) : null

  if (speakers.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={m.external_speakers_page_title()}
          subtitle={m.external_speakers_subtitle()}
          breadcrumbs={[{ label: m.sidebar_programs(), to: '/programs' }, { label: m.external_speakers_page_title() }]}
          backTo="/programs"
          actions={newAction}
        />

        <EmptyState
          icon={UsersRound}
          title={m.external_speakers_empty_title()}
          description={m.external_speakers_empty_description()}
          action={newAction ?? undefined}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.external_speakers_page_title()}
        subtitle={m.external_speakers_subtitle()}
        breadcrumbs={[{ label: m.sidebar_programs(), to: '/programs' }, { label: m.external_speakers_page_title() }]}
        backTo="/programs"
        actions={newAction}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput placeholder={m.external_speakers_search_placeholder()} />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="showArchived"
            defaultChecked={showArchived}
            onChange={e => {
              const url = new URL(window.location.href)
              if (e.target.checked) url.searchParams.set('showArchived', 'on')
              else url.searchParams.delete('showArchived')
              window.location.href = url.toString()
            }}
          />
          {m.external_speakers_show_archived()}
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.external_speakers_table_name()}</TableHead>
              <TableHead>{m.external_speakers_table_congregation()}</TableHead>
              <TableHead className="max-sm:hidden">{m.external_speakers_table_contact()}</TableHead>
              <TableHead>{m.external_speakers_table_last_visit()}</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">{m.common_actions()}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {speakers.map(speaker => {
              const isIncomplete = speaker.congregationName === ''
              const isArchived = speaker.archivedAt !== null
              return (
                <TableRow key={speaker.id} className={isArchived ? 'opacity-60' : ''}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{speaker.name}</span>
                      {isArchived && (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <ArchiveRestore className="size-3" />
                          {m.external_speakers_archived_badge()}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isIncomplete ? (
                      <Badge variant="secondary">{m.external_speakers_to_complete_badge()}</Badge>
                    ) : (
                      speaker.congregationName
                    )}
                  </TableCell>
                  <TableCell className="max-sm:hidden">
                    <div className="flex flex-col gap-1 text-muted-foreground text-xs">
                      {speaker.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="size-3" />
                          {speaker.phone}
                        </span>
                      )}
                      {speaker.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="size-3" />
                          {speaker.email}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatRelative(speaker.lastVisitDate)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" asChild>
                      <Link to={`./${speaker.id}/edit`}>
                        {canManage ? <Pencil className="size-4" /> : <Eye className="size-4" />}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
