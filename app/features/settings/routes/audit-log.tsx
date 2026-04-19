import { Form as RouterForm, useSearchParams } from 'react-router'
import { findAuditLogsPaginated } from '~/features/settings/server/audit-log.server'
import * as m from '~/paraglide/messages'
import { userContext } from '~/shared/libs/route-context.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import Pagination from '~/shared/ui/Pagination'
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
    'user.login': 'Connexion',
    'user.login.failed': 'Echec de connexion',
    'user.logout': 'Déconnexion',
    'user.created': 'Utilisateur créé',
    'user.updated': 'Utilisateur modifié',
    'user.anonymized': 'Utilisateur anonymisé',
    'user.roles.changed': 'Rôles modifiés',
    'user.data.exported': 'Données exportées',
    'consent.granted': 'Consentement accordé',
    'consent.withdrawn': 'Consentement retiré',
    'password.changed': 'Mot de passe modifié',
    'password.reset.requested': 'Réinitialisation demandée',
    'board.read_status.viewed': 'Statut de lecture consulté',
    'platform.congregation.updated': 'Assemblée modifiée (admin)',
    'platform.users.listed': 'Utilisateurs consultés (admin)',
  }
  return translations[action] ?? action
}

export default function AuditLogPage({ loaderData }: Route.ComponentProps) {
  const { logs, pagination } = loaderData
  const [searchParams] = useSearchParams()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.audit_log_title()} subtitle={m.audit_log_subtitle()} />

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
            <option value="user.login">Connexion</option>
            <option value="user.login.failed">Echec de connexion</option>
            <option value="user.created">Utilisateur créé</option>
            <option value="user.updated">Utilisateur modifié</option>
            <option value="user.anonymized">Utilisateur anonymisé</option>
            <option value="password.changed">Mot de passe modifié</option>
            <option value="password.reset.requested">Réinitialisation demandée</option>
            <option value="consent.granted">Consentement accordé</option>
            <option value="consent.withdrawn">Consentement retiré</option>
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
        <Button type="submit" variant="secondary">
          {m.audit_log_filter_apply()}
        </Button>
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
