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
    'congregation.exported': m.audit_log_action_congregation_exported(),
    'congregation.imported': m.audit_log_action_congregation_imported(),
    'platform.congregation.updated': m.audit_log_action_platform_congregation_updated(),
    'platform.users.listed': m.audit_log_action_platform_users_listed(),
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
            <option value="user.data.exported">{m.audit_log_action_user_data_exported()}</option>
            <option value="password.changed">{m.audit_log_action_password_changed()}</option>
            <option value="password.reset.requested">{m.audit_log_action_password_reset_requested()}</option>
            <option value="consent.granted">{m.audit_log_action_consent_granted()}</option>
            <option value="consent.withdrawn">{m.audit_log_action_consent_withdrawn()}</option>
            <option value="board.read_status.viewed">{m.audit_log_action_board_read_status_viewed()}</option>
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
