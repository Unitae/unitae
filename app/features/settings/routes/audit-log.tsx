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
    'platform.congregation.updated': m.audit_log_action_platform_congregation_updated(),
    'platform.users.listed': m.audit_log_action_platform_users_listed(),
    'congregation.registered': m.audit_log_action_congregation_registered(),
    'congregation.exported': m.audit_log_action_congregation_exported(),
    'congregation.imported': m.audit_log_action_congregation_imported(),
    'user.publisher_status.changed': m.audit_log_action_user_publisher_status_changed(),
    'settings.general.updated': m.audit_log_action_settings_general_updated(),
    'settings.congregation.updated': m.audit_log_action_settings_congregation_updated(),
    'event_kind.updated': m.audit_log_action_event_kind_updated(),
    'programme_template.created': m.audit_log_action_programme_template_created(),
    'programme_template.updated': m.audit_log_action_programme_template_updated(),
    'programme_template.deleted': m.audit_log_action_programme_template_deleted(),
    'territory.created': m.audit_log_action_territory_created(),
    'territory.updated': m.audit_log_action_territory_updated(),
    'territory.deleted': m.audit_log_action_territory_deleted(),
    'attribution.created': m.audit_log_action_attribution_created(),
    'attribution.updated': m.audit_log_action_attribution_updated(),
    'attribution.deleted': m.audit_log_action_attribution_deleted(),
    'building.created': m.audit_log_action_building_created(),
    'building.updated': m.audit_log_action_building_updated(),
    'building.deleted': m.audit_log_action_building_deleted(),
    'building.enabled': m.audit_log_action_building_enabled(),
    'building.disabled': m.audit_log_action_building_disabled(),
    'publisher.created': m.audit_log_action_publisher_created(),
    'publisher.updated': m.audit_log_action_publisher_updated(),
    'publisher_group.created': m.audit_log_action_publisher_group_created(),
    'publisher_group.deleted': m.audit_log_action_publisher_group_deleted(),
    'publisher_activity.created': m.audit_log_action_publisher_activity_created(),
    'publisher_activity.updated': m.audit_log_action_publisher_activity_updated(),
    'publisher_activity.deleted': m.audit_log_action_publisher_activity_deleted(),
    'programme.generated': m.audit_log_action_programme_generated(),
    'event.created': m.audit_log_action_event_created(),
    'event.updated': m.audit_log_action_event_updated(),
    'event.deleted': m.audit_log_action_event_deleted(),
    'events.bulk_deleted': m.audit_log_action_events_bulk_deleted(),
    'day_off.created': m.audit_log_action_day_off_created(),
    'day_off.deleted': m.audit_log_action_day_off_deleted(),
    'board.document.created': m.audit_log_action_board_document_created(),
    'board.document.deleted': m.audit_log_action_board_document_deleted(),
    'board.documents.bulk_deleted': m.audit_log_action_board_documents_bulk_deleted(),
    'board.document.file_replaced': m.audit_log_action_board_document_file_replaced(),
    'board.document.version_created': m.audit_log_action_board_document_version_created(),
    'board.document.version_restored': m.audit_log_action_board_document_version_restored(),
    'notification.preference.changed': m.audit_log_action_notification_preference_changed(),
  }
  return translations[action] ?? action
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
            <option value="user.login">{m.audit_log_action_user_login()}</option>
            <option value="user.login.failed">{m.audit_log_action_user_login_failed()}</option>
            <option value="user.logout">{m.audit_log_action_user_logout()}</option>
            <option value="user.created">{m.audit_log_action_user_created()}</option>
            <option value="user.updated">{m.audit_log_action_user_updated()}</option>
            <option value="user.anonymized">{m.audit_log_action_user_anonymized()}</option>
            <option value="user.roles.changed">{m.audit_log_action_user_roles_changed()}</option>
            <option value="user.publisher_status.changed">{m.audit_log_action_user_publisher_status_changed()}</option>
            <option value="user.data.exported">{m.audit_log_action_user_data_exported()}</option>
            <option value="consent.granted">{m.audit_log_action_consent_granted()}</option>
            <option value="consent.withdrawn">{m.audit_log_action_consent_withdrawn()}</option>
            <option value="password.changed">{m.audit_log_action_password_changed()}</option>
            <option value="password.reset.requested">{m.audit_log_action_password_reset_requested()}</option>
            <option value="settings.general.updated">{m.audit_log_action_settings_general_updated()}</option>
            <option value="settings.congregation.updated">{m.audit_log_action_settings_congregation_updated()}</option>
            <option value="event_kind.updated">{m.audit_log_action_event_kind_updated()}</option>
            <option value="programme_template.created">{m.audit_log_action_programme_template_created()}</option>
            <option value="programme_template.updated">{m.audit_log_action_programme_template_updated()}</option>
            <option value="programme_template.deleted">{m.audit_log_action_programme_template_deleted()}</option>
            <option value="territory.created">{m.audit_log_action_territory_created()}</option>
            <option value="territory.updated">{m.audit_log_action_territory_updated()}</option>
            <option value="territory.deleted">{m.audit_log_action_territory_deleted()}</option>
            <option value="attribution.created">{m.audit_log_action_attribution_created()}</option>
            <option value="attribution.updated">{m.audit_log_action_attribution_updated()}</option>
            <option value="attribution.deleted">{m.audit_log_action_attribution_deleted()}</option>
            <option value="building.created">{m.audit_log_action_building_created()}</option>
            <option value="building.updated">{m.audit_log_action_building_updated()}</option>
            <option value="building.deleted">{m.audit_log_action_building_deleted()}</option>
            <option value="building.enabled">{m.audit_log_action_building_enabled()}</option>
            <option value="building.disabled">{m.audit_log_action_building_disabled()}</option>
            <option value="publisher.created">{m.audit_log_action_publisher_created()}</option>
            <option value="publisher.updated">{m.audit_log_action_publisher_updated()}</option>
            <option value="publisher_group.created">{m.audit_log_action_publisher_group_created()}</option>
            <option value="publisher_group.deleted">{m.audit_log_action_publisher_group_deleted()}</option>
            <option value="publisher_activity.created">{m.audit_log_action_publisher_activity_created()}</option>
            <option value="publisher_activity.updated">{m.audit_log_action_publisher_activity_updated()}</option>
            <option value="publisher_activity.deleted">{m.audit_log_action_publisher_activity_deleted()}</option>
            <option value="programme.generated">{m.audit_log_action_programme_generated()}</option>
            <option value="event.created">{m.audit_log_action_event_created()}</option>
            <option value="event.updated">{m.audit_log_action_event_updated()}</option>
            <option value="event.deleted">{m.audit_log_action_event_deleted()}</option>
            <option value="events.bulk_deleted">{m.audit_log_action_events_bulk_deleted()}</option>
            <option value="day_off.created">{m.audit_log_action_day_off_created()}</option>
            <option value="day_off.deleted">{m.audit_log_action_day_off_deleted()}</option>
            <option value="board.document.created">{m.audit_log_action_board_document_created()}</option>
            <option value="board.document.deleted">{m.audit_log_action_board_document_deleted()}</option>
            <option value="board.documents.bulk_deleted">{m.audit_log_action_board_documents_bulk_deleted()}</option>
            <option value="board.document.file_replaced">{m.audit_log_action_board_document_file_replaced()}</option>
            <option value="board.document.version_created">{m.audit_log_action_board_document_version_created()}</option>
            <option value="board.document.version_restored">{m.audit_log_action_board_document_version_restored()}</option>
            <option value="board.read_status.viewed">{m.audit_log_action_board_read_status_viewed()}</option>
            <option value="notification.preference.changed">{m.audit_log_action_notification_preference_changed()}</option>
            <option value="congregation.registered">{m.audit_log_action_congregation_registered()}</option>
            <option value="congregation.exported">{m.audit_log_action_congregation_exported()}</option>
            <option value="congregation.imported">{m.audit_log_action_congregation_imported()}</option>
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
                  {log.entityType ? `${log.entityType} #${log.entityId}` : '—'}
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
