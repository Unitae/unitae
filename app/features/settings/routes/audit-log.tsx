import { Form as RouterForm, useSearchParams } from 'react-router'
import { findAuditLogsPaginated } from '~/features/settings/server/audit-log.server'
import * as m from '~/i18n/paraglide/messages'
import { userContext } from '~/shared/auth/route-context.server'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import Pagination from '~/shared/ui/Pagination'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '~/shared/ui/select'
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
  const actionParam = url.searchParams.get('action')
  const action = actionParam && actionParam !== 'all' ? actionParam : undefined
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
    'user.permissions.changed': m.audit_log_action_user_permissions_changed(),
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

function getEntityLabel(entityType: string): string {
  switch (entityType) {
    case 'User':
      return m.audit_log_entity_user()
    case 'Congregation':
      return m.audit_log_entity_congregation()
    case 'BoardDocument':
      return m.audit_log_entity_board_document()
    case 'BoardSection':
      return m.audit_log_entity_board_section()
    case 'Territory':
      return m.audit_log_entity_territory()
    case 'Attribution':
      return m.audit_log_entity_attribution()
    case 'PublisherGroup':
      return m.audit_log_entity_publisher_group()
    case 'PublisherActivity':
      return m.audit_log_entity_publisher_activity()
    default:
      return entityType
  }
}

function translateEntity(entityType: string | null, entityId: number | null): string {
  if (!entityType || entityId == null) return '—'
  return `${getEntityLabel(entityType)} #${entityId}`
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
          <Select name="action" defaultValue={searchParams.get('action') || 'all'}>
            <SelectTrigger id="action">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{m.audit_log_filter_all_actions()}</SelectItem>
              <SelectGroup>
                <SelectLabel>{m.audit_log_group_auth()}</SelectLabel>
                <SelectItem value="user.login">{m.audit_log_action_user_login()}</SelectItem>
                <SelectItem value="user.login.failed">{m.audit_log_action_user_login_failed()}</SelectItem>
                <SelectItem value="user.logout">{m.audit_log_action_user_logout()}</SelectItem>
                <SelectItem value="password.changed">{m.audit_log_action_password_changed()}</SelectItem>
                <SelectItem value="password.reset.requested">
                  {m.audit_log_action_password_reset_requested()}
                </SelectItem>
                <SelectItem value="consent.granted">{m.audit_log_action_consent_granted()}</SelectItem>
                <SelectItem value="consent.withdrawn">{m.audit_log_action_consent_withdrawn()}</SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>{m.audit_log_group_users()}</SelectLabel>
                <SelectItem value="user.created">{m.audit_log_action_user_created()}</SelectItem>
                <SelectItem value="user.updated">{m.audit_log_action_user_updated()}</SelectItem>
                <SelectItem value="user.anonymized">{m.audit_log_action_user_anonymized()}</SelectItem>
                <SelectItem value="user.permissions.changed">
                  {m.audit_log_action_user_permissions_changed()}
                </SelectItem>
                <SelectItem value="user.data.exported">{m.audit_log_action_user_data_exported()}</SelectItem>
                <SelectItem value="publisher.created">{m.audit_log_action_publisher_created()}</SelectItem>
                <SelectItem value="publisher.updated">{m.audit_log_action_publisher_updated()}</SelectItem>
                <SelectItem value="publisher.status.changed">
                  {m.audit_log_action_publisher_status_changed()}
                </SelectItem>
                <SelectItem value="publisher.group.created">{m.audit_log_action_publisher_group_created()}</SelectItem>
                <SelectItem value="publisher.group.deleted">{m.audit_log_action_publisher_group_deleted()}</SelectItem>
                <SelectItem value="publisher.activity.created">
                  {m.audit_log_action_publisher_activity_created()}
                </SelectItem>
                <SelectItem value="publisher.activity.updated">
                  {m.audit_log_action_publisher_activity_updated()}
                </SelectItem>
                <SelectItem value="publisher.activity.deleted">
                  {m.audit_log_action_publisher_activity_deleted()}
                </SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>{m.audit_log_group_territories()}</SelectLabel>
                <SelectItem value="territory.created">{m.audit_log_action_territory_created()}</SelectItem>
                <SelectItem value="territory.updated">{m.audit_log_action_territory_updated()}</SelectItem>
                <SelectItem value="territory.deleted">{m.audit_log_action_territory_deleted()}</SelectItem>
                <SelectItem value="attribution.created">{m.audit_log_action_attribution_created()}</SelectItem>
                <SelectItem value="attribution.updated">{m.audit_log_action_attribution_updated()}</SelectItem>
                <SelectItem value="attribution.deleted">{m.audit_log_action_attribution_deleted()}</SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>{m.audit_log_group_board()}</SelectLabel>
                <SelectItem value="board.document.created">{m.audit_log_action_board_document_created()}</SelectItem>
                <SelectItem value="board.document.updated">{m.audit_log_action_board_document_updated()}</SelectItem>
                <SelectItem value="board.document.deleted">{m.audit_log_action_board_document_deleted()}</SelectItem>
                <SelectItem value="board.section.created">{m.audit_log_action_board_section_created()}</SelectItem>
                <SelectItem value="board.section.updated">{m.audit_log_action_board_section_updated()}</SelectItem>
                <SelectItem value="board.read_status.viewed">
                  {m.audit_log_action_board_read_status_viewed()}
                </SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>{m.audit_log_group_settings()}</SelectLabel>
                <SelectItem value="congregation.settings.updated">
                  {m.audit_log_action_congregation_settings_updated()}
                </SelectItem>
                <SelectItem value="congregation.exported">{m.audit_log_action_congregation_exported()}</SelectItem>
                <SelectItem value="congregation.imported">{m.audit_log_action_congregation_imported()}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
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
