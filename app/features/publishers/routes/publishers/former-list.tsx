import { Eye, RotateCcw, UserMinus } from 'lucide-react'
import { Link, redirect, useSubmit } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SearchInput } from '~/shared/ui/SearchInput'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/former-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.publishers_former_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canViewPublishers = permissions.has(Permission.PublisherViewer)
  const canManagePublisher = permissions.has(Permission.PublisherManager)

  if (!canViewPublishers) {
    logger.warn(`Try to load former publishers. User ID: ${currentUser.id}. Lacks PublisherViewer.`)
    throw redirect('/')
  }

  const url = new URL(request.url)
  const search = url.searchParams.get('q')?.trim() || undefined

  return withScopeFromContext(context, async db => {
    const members = await db.member.findMany({
      where: {
        congregationId: currentUser.congregationId,
        isPublisher: true,
        leftAt: { not: null },
        // Anonymized rows are never shown — identity is gone, no recovery path.
        anonymizedAt: null,
        ...(search
          ? {
              OR: [
                { firstname: { contains: search, mode: 'insensitive' as const } },
                { lastname: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: { id: true, firstname: true, lastname: true, leftAt: true },
      orderBy: [{ leftAt: 'desc' }, { lastname: 'asc' }, { firstname: 'asc' }],
    })

    return {
      members,
      canManagePublisher,
      searchQuery: search ?? '',
    }
  })
}

export default function FormerPublishersPage({ loaderData }: Route.ComponentProps) {
  const { members, canManagePublisher, searchQuery } = loaderData
  const submit = useSubmit()

  if (members.length < 1 && searchQuery.length < 1) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={m.publishers_former_title()}
          subtitle={m.publishers_former_subtitle()}
          breadcrumbs={[{ label: m.sidebar_publishers(), to: '/publishers' }, { label: m.publishers_former_title() }]}
          backTo="/publishers"
        />
        <EmptyState
          icon={UserMinus}
          title={m.publishers_former_empty_title()}
          description={m.publishers_former_empty_description()}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.publishers_former_title()}
        subtitle={m.publishers_former_subtitle()}
        breadcrumbs={[{ label: m.sidebar_publishers(), to: '/publishers' }, { label: m.publishers_former_title() }]}
        backTo="/publishers"
      />

      <SearchInput placeholder={m.publishers_search_placeholder()} />

      {members.length < 1 ? (
        <EmptyState
          icon={UserMinus}
          title={m.publishers_empty_no_match_title()}
          description={m.publishers_former_empty_no_match_description({ query: searchQuery })}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center max-sm:text-left">{m.publishers_table_firstname()}</TableHead>
                <TableHead className="text-center">{m.publishers_table_lastname()}</TableHead>
                <TableHead className="text-center">{m.publishers_former_table_left_on()}</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">{m.settings_users_table_actions_sr()}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map(member => (
                <TableRow key={member.id} className="text-muted-foreground">
                  <TableCell className="text-center max-sm:text-left">
                    <Link to={`/publishers/${member.id}/view`} className="hover:text-primary">
                      {member.firstname}
                    </Link>
                  </TableCell>
                  <TableCell className="text-center">
                    <Link to={`/publishers/${member.id}/view`} className="hover:text-primary">
                      {member.lastname?.toLocaleUpperCase()}
                    </Link>
                  </TableCell>
                  <TableCell className="text-center">
                    {member.leftAt ? new Date(member.leftAt).toLocaleDateString('fr-FR') : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button asChild variant="ghost" size="icon">
                        <Link to={`/publishers/${member.id}/view`}>
                          <Eye className="size-4" />
                        </Link>
                      </Button>
                      {canManagePublisher && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={m.publishers_view_mark_as_returned_title()}
                          onClick={() =>
                            submit(null, {
                              method: 'post',
                              action: `/publishers/${member.id}/mark-as-returned`,
                            })
                          }
                        >
                          <RotateCcw className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
