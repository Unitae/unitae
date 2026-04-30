import { Form as RouterForm, useSearchParams } from 'react-router'
import { findAuditLogsPaginated } from '~/features/settings/server/audit-log.server'
import * as m from '~/paraglide/messages'
import { userContext } from '~/shared/auth/route-context.server'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import Pagination from '~/shared/ui/Pagination'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { paginationFromUrl } from '~/shared/utils/pagination.server'

import type { Route } from './+types/audit-log'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.audit_log_meta_title() }]
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = context.get(userContext)
  const congregationId = currentUser.congregationId

  const url = new URL(request.url)
  const action = url.searchParams.get('action') ?? undefined
  const dateFrom = url.searchParams.get('dateFrom') ?? undefined
  const dateTo = url.searchParams.get('dateTo') ?? undefined

  const { count, logs } = await findAuditLogsPaginated({
    congregationId,
    page: Number(url.searchParams.get('page') ?? '1'),
    pageSize: 25,
    action,
    dateFrom,
    dateTo,
  })

  const pagination = paginationFromUrl(url, count)

  return {
    logs: logs.map(log => ({
      id: log.id,
      action: log.action,
      actorEmail: log.actorEmail,
      entityType: log.entityType,
      entityId: log.entityId,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
    })),
    pagination,
  }
}

function translateAction(action: string): string {
  const translations: Record<string, string> = {
    'user.login': m.audit_log_action_user_login(),
    'user.login.failed': m.audit_log_action_user_login_failed(),
    'user.logout': m.audit_log_action_user_logout(),
    'user.created': m.audit_log_action_user_created(),
    'user.updated': m.audit_log_action_user_updated(),
    'user.anonymized': m.audit_log_action_user_anonymized(),
    'user.roles.changed': m.audit_log_action_user_roles_changed(),
    'user.data.exported': m.audit_log_action_user_data_exported(),
    'consent.granted': m.audit_log_action_consent_granted(),
    'consent.withdrawn': m.audit_log_action_consent_withdrawn(),
    'password.changed': m.audit_log_action_password_changed(),
    'password.reset.requested': m.audit_log_action_password_reset_requested(),
    'board.read_status.viewed': m.audit_log_action_board_read_status_viewed(),
    'board.document.created': m.audit_log_action_board_document_created(),
    'board.document.updated': m.audit_log_action_board_document_updated(),
    'board.document.deleted': m.audit_log_action_board_document_deleted(),
    'board.section.created': m.audit_log_action_board_section_created(),
    'board.section.updated': m.audit_log_action_board_section_updated(),
    'territory.created': m.audit_log_action_territory_created(),
    'territory.updated': m.audit_log_action_territory_updated(),
    'territory.deleted': m.audit_log_action_territory_deleted(),
    'attribution.created': m.audit_log_action_attribution_created(),
    'attribution.updated': m.audit_log_action_attribution_updated(),
    'attribution.deleted': m.audit_log_action_attribution_deleted(),
    'publisher.created': m.audit_log_action_publisher_created(),
    'publisher.updated': m.audit_log_action_publisher_updated(),
    'publisher.status.changed': m.audit_log_action_publisher_status_changed(),
    'publisher.group.created': m.audit_log_action_publisher_group_created(),
    'publisher.group.deleted': m.audit_log_action_publisher_group_deleted(),
    'publisher.activity.created': m.audit_log_action_publisher_activity_created(),
    'publisher.activity.updated': m.audit_log_action_publisher_activity_updated(),
    'publisher.activity.deleted': m.audit_log_action_publisher_activity_deleted(),
    'congregation.settings.updated': m.audit_log_action_congregation_settings_updated(),
    'congregation.exported': m.audit_log_action_congregation_exported(),
    'congregation.imported': m.audit_log_action_congregation_imported(),
    'platform.congregation.updated': m.audit_log_action_platform_congregation_updated(),
    'platform.users.listed': m.audit_log_action_platform_users_listed(),
  }
  return translations[action] ?? action
}

function translateEntity(entityType: string | null, entityId: number | null): string {
  if (!entityType || entityId == null) return '—'
  const labels: Record<string, string> = {
    'User': m.audit_log_entity_user(),
    'Congregation': m.audit_log_entity_congregation(),
    'BoardDocument': m.audit_log_entity_board_document(),
    'BoardSection': m.audit_log_entity_board_section(),
    'Territory': m.audit_log_entity_territory(),
    'Attribution': m.audit_log_entity_attribution(),
    'PublisherGroup': m.audit_log_entity_publisher_group(),
    'PublisherActivity': m.audit_log_entity_publisher_activity(),
  }
  return `${labels[entityType] ?? entityType} #${entityId}`
}

export default function AuditLogPage({ loaderData }: Route.ComponentProps) {
  const { logs, pagination } = loaderData
  const [searchParams] = useSearchParams()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.audit_log_title()}
        subtitle={m.audit_log_subtitle()}
        breadcrumbs={[{ label: m.sidebar_settings(), to: '/settings' }, { label: m.sidebar_audit_log() }]}
      />

      <RouterForm method="get" className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="action">{m.audit_log_filter_action()}</Label>
          <select
            id="action"
            name="action"
            defaultValue={searchParams.get('action') ?? ''}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">{m.audit_log_filter_all_actions()}</option>
            <optgroup label={m.audit_log_group_auth()}>
              <option value="user.login">{m.audit_log_action_user_login()}</option>
              <option value="user.login.failed">{m.audit_log_action_user_login_failed()}</option>
              <option value="user.logout">{m.audit_log_action_user_logout()}</option>
              <option value="password.changed">{m.audit_log_action_password_changed()}</option>
              <option value="password.reset.requested">{m.audit_log_action_password_reset_requested()}</option>
              <option value="consent.granted">{m.audit_log_action_consent_granted()}</option>
              <option value="consent.withdrawn">{m.audit_log_action_consent_withdrawn()}</option>
            </optgroup>
            <optgroup label={m.audit_log_group_users()}>
              <option value="user.created">{m.audit_log_action_user_created()}</option>
              <option value="user.updated">{m.audit_log_action_user_updated()}</option>
              <option value="user.anonymized">{m.audit_log_action_user_anonymized()}</option>
              <option value="user.roles.changed">{m.audit_log_action_user_roles_changed()}</option>
              <option value="user.data.exported">{m.audit_log_action_user_data_exported()}</option>
              <option value="publisher.created">{m.audit_log_action_publisher_created()}</option>
              <option value="publisher.updated">{m.audit_log_action_publisher_updated()}</option>
              <option value="publisher.status.changed">{m.audit_log_action_publisher_status_changed()}</option>
              <option value="publisher.group.created">{m.audit_log_action_publisher_group_created()}</option>
              <option value="publisher.group.deleted">{m.audit_log_action_publisher_group_deleted()}</option>
              <option value="publisher.activity.created">{m.audit_log_action_publisher_activity_created()}</option>
              <option value="publisher.activity.updated">{m.audit_log_action_publisher_activity_updated()}</option>
              <option value="publisher.activity.deleted">{m.audit_log_action_publisher_activity_deleted()}</option>
            </optgroup>
            <optgroup label={m.audit_log_group_territories()}>
              <option value="territory.created">{m.audit_log_action_territory_created()}</option>
              <option value="territory.updated">{m.audit_log_action_territory_updated()}</option>
              <option value="territory.deleted">{m.audit_log_action_territory_deleted()}</option>
              <option value="attribution.created">{m.audit_log_action_attribution_created()}</option>
              <option value="attribution.updated">{m.audit_log_action_attribution_updated()}</option>
              <option value="attribution.deleted">{m.audit_log_action_attribution_deleted()}</option>
            </optgroup>
            <optgroup label={m.audit_log_group_board()}>
              <option value="board.document.created">{m.audit_log_action_board_document_created()}</option>
              <option value="board.document.updated">{m.audit_log_action_board_document_updated()}</option>
              <option value="board.document.deleted">{m.audit_log_action_board_document_deleted()}</option>
              <option value="board.section.created">{m.audit_log_action_board_section_created()}</option>
              <option value="board.section.updated">{m.audit_log_action_board_section_updated()}</option>
              <option value="board.read_status.viewed">{m.audit_log_action_board_read_status_viewed()}</option>
            </optgroup>
            <optgroup label={m.audit_log_group_settings()}>
              <option value="congregation.settings.updated">{m.audit_log_action_congregation_settings_updated()}</option>
              <option value="congregation.exported">{m.audit_log_action_congregation_exported()}</option>
              <option value="congregation.imported">{m.audit_log_action_congregation_imported()}</option>
            </optgroup>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="dateFrom">{m.audit_log_filter_from()}</Label>
          <Input id="dateFrom" name="dateFrom" type="date" defaultValue={searchParams.get('dateFrom') ?? ''} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dateTo">{m.audit_log_filter_to()}</Label>
          <Input id="dateTo" name="dateTo" type="date" defaultValue={searchParams.get('dateTo') ?? ''} />
        </div>
        <SubmitButton variant="secondary">{m.audit_log_filter_apply()}</SubmitButton>
      </RouterForm>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.audit_log_col_date()}</TableHead>
              <TableHead>{m.audit_log_col_actor()}</TableHead>
              <TableHead>{m.audit_log_col_action()}</TableHead>
              <TableHead>{m.audit_log_col_entity()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map(log => (
              <TableRow key={log.id}>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(log.createdAt).toLocaleString('fr-FR')}
                </TableCell>
                <TableCell className="text-sm">{log.actorEmail ?? '—'}</TableCell>
                <TableCell className="text-sm">{translateAction(log.action)}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {translateEntity(log.entityType, log.entityId)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Pagination page={pagination.page} pages={pagination.pages} size={pagination.size} total={pagination.total} />
    </div>
  )
}
