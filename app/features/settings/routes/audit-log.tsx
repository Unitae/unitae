import { SidePanel } from '@unitae/ui'
import { auditActionLabel } from '~/features/settings/model/audit-actions'
import { auditDetails } from '~/features/settings/model/audit-details'
import { auditEntityLabel } from '~/features/settings/model/audit-entities'
import { auditPeriod } from '~/features/settings/model/audit-period'
import { findAuditLogsPaginated } from '~/features/settings/server/audit-log.server'
import { AuditEntryDetail, type AuditLogRow, AuditLogTable } from '~/features/settings/ui/AuditLogTable'
import { AuditLogToolbar } from '~/features/settings/ui/AuditLogToolbar'
import { SettingsHeader } from '~/features/settings/ui/SettingsHeader'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  requirePermission,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { useSideEditor } from '~/shared/ui/hooks/use-side-editor'
import Pagination from '~/shared/ui/Pagination'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '~/shared/ui/sheet'
import { formatDateForInput } from '~/shared/utils/event-time'
import type { Route } from './+types/audit-log'

export const meta: Route.MetaFunction = () => [{ title: m.audit_log_meta_title() }]

/** The sizes the pagination offers; any other asks for the first. */
const PAGE_SIZES = [25, 50, 100, 250, 500, 1000, 2000]

export async function loader({ request, context }: Route.LoaderArgs) {
  // The settings layout admits several permissions; the audit log is congregation administration.
  requirePermission(context.get(permissionsContext), Permission.CanConfigureCongregation)
  const { congregationId } = context.get(currentAccountContext)
  const { timezone } = context.get(congregationContext)
  const params = new URL(request.url).searchParams
  const today = formatDateForInput(new Date(), timezone)
  const range = auditPeriod({ period: params.get('period'), from: params.get('from'), to: params.get('to') }, today)
  const askedSize = Number(params.get('pageSize'))
  const action = params.get('action')

  const result = await findAuditLogsPaginated({
    congregationId,
    page: Number(params.get('page') ?? '1'),
    pageSize: PAGE_SIZES.includes(askedSize) ? askedSize : PAGE_SIZES[0],
    timeZone: timezone,
    action: action && action !== 'all' ? action : undefined,
    from: range.from,
    to: range.to,
    search: params.get('q')?.trim() || undefined,
  })

  const locale = getLocale()
  const time = { timeZone: timezone, hour: '2-digit', minute: '2-digit' } as const
  const thisYear = new Intl.DateTimeFormat(locale, { ...time, day: 'numeric', month: 'short' })
  const otherYear = new Intl.DateTimeFormat(locale, { ...time, day: 'numeric', month: 'short', year: 'numeric' })
  const full = new Intl.DateTimeFormat(locale, { timeZone: timezone, dateStyle: 'long', timeStyle: 'medium' })

  const rows: AuditLogRow[] = result.logs.map(log => ({
    id: log.id,
    when: (formatDateForInput(log.createdAt, timezone).startsWith(today.slice(0, 4)) ? thisYear : otherYear).format(
      log.createdAt,
    ),
    fullDate: full.format(log.createdAt),
    person: log.actorName ?? log.actorEmail ?? m.audit_log_system(),
    email: log.actorEmail,
    action: auditActionLabel(log.action),
    object: auditEntityLabel(log.entityType, log.entityId),
    details: auditDetails(log.metadata),
  }))

  return {
    rows,
    count: result.count,
    page: result.page,
    pageSize: result.pageSize,
    pages: result.pages,
    period: range.period,
    from: range.from,
    to: range.to,
    today,
  }
}

export default function AuditLogPage({ loaderData }: Route.ComponentProps) {
  const { rows, count, page, pageSize, pages, period, from, to, today } = loaderData
  const panel = useSideEditor<'entry'>(target => rows.some(row => row.id === target.id))
  const selected = panel.target ? rows.find(row => row.id === panel.target?.id) : undefined

  return (
    <div className="flex flex-col">
      <SettingsHeader title={m.settings_entry_audit()} subtitle={m.audit_log_subtitle()} />
      <AuditLogToolbar count={count} period={period} from={from} to={to} today={today} />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[3_1_480px] flex-col gap-4">
          {rows.length === 0 ? (
            <p className="rounded-lg border bg-card px-4.5 py-6 text-center text-muted-foreground text-sm">
              {m.audit_log_empty()}
            </p>
          ) : (
            <AuditLogTable
              rows={rows}
              selectedId={selected?.id ?? null}
              onSelect={(row, trigger) => panel.request({ kind: 'entry', id: row.id, trigger })}
            />
          )}
          {count > 0 && <Pagination page={page} pages={pages} size={pageSize} total={count} />}
        </div>
        {panel.docked && selected && (
          <SidePanel
            key={selected.id}
            title={selected.action}
            description={selected.fullDate}
            closeLabel={m.audit_log_close()}
            onClose={panel.close}
            returnFocus={panel.target?.trigger}
          >
            <AuditEntryDetail row={selected} />
          </SidePanel>
        )}
      </div>

      {!panel.docked && (
        <Sheet open={selected != null} onOpenChange={next => !next && panel.close()}>
          <SheetContent className="sm:max-w-md">
            {selected && (
              <>
                <SheetHeader>
                  <SheetTitle>{selected.action}</SheetTitle>
                  <SheetDescription>{selected.fullDate}</SheetDescription>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-4 pb-4">
                  <AuditEntryDetail row={selected} />
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
