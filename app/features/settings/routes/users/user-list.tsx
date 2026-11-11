import { Plus } from 'lucide-react'
import { useState } from 'react'
import { redirect, useSearchParams } from 'react-router'
import { listUserAccounts } from '~/features/settings/server/user-accounts.queries'
import { NewUserDialog } from '~/features/settings/ui/NewUserDialog'
import { SettingsHeader } from '~/features/settings/ui/SettingsHeader'
import { UserAccountsTable } from '~/features/settings/ui/UserAccountsTable'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { QuickViews } from '~/shared/ui/QuickViews'
import { SearchInput } from '~/shared/ui/SearchInput'
import type { Route } from './+types/user-list'

export const meta: Route.MetaFunction = () => [{ title: m.settings_users_meta_title() }]

const VIEWS = ['all', 'active', 'deactivated'] as const
type View = (typeof VIEWS)[number]
const isView = (value: string | null): value is View => VIEWS.includes(value as View)

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanViewUsers) && !permissions.has(Permission.CanManageUsers)) throw redirect('/')

  const params = new URL(request.url).searchParams
  const search = params.get('q')?.trim() || undefined
  const viewParam = params.get('view')
  const view: View = isView(viewParam) ? viewParam : 'all'

  return withScopeFromContext(context, async (db, congregationId) => {
    const rows = await listUserAccounts(db, congregationId, { search })
    const off = (row: (typeof rows)[number]) => row.status === 'deactivated' || row.status === 'anonymized'
    const counts = {
      all: rows.length,
      active: rows.filter(row => !off(row)).length,
      deactivated: rows.filter(off).length,
    }
    const shown = view === 'all' ? rows : rows.filter(row => (view === 'deactivated' ? off(row) : !off(row)))
    return { rows: shown, counts, view, canManage: permissions.has(Permission.CanManageUsers) }
  })
}

const VIEW_LABEL: Record<View, () => string> = {
  all: m.settings_users_view_all,
  active: m.settings_users_view_active,
  deactivated: m.settings_users_view_deactivated,
}

export default function UserListPage({ loaderData }: Route.ComponentProps) {
  const { rows, counts, view, canManage } = loaderData
  const [, setSearchParams] = useSearchParams()
  const [creating, setCreating] = useState(false)

  const choose = (next: View) =>
    setSearchParams(
      prev => {
        if (next === 'all') prev.delete('view')
        else prev.set('view', next)
        return prev
      },
      { replace: true },
    )

  return (
    <div className="flex flex-col">
      <SettingsHeader
        title={m.settings_entry_users()}
        subtitle={m.settings_users_subtitle()}
        actions={
          canManage && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" />
              {m.settings_users_new_button()}
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-[200px] flex-[0_1_280px]">
          <SearchInput paramName="q" placeholder={m.settings_users_search_placeholder()} />
        </div>
        <QuickViews
          label={m.settings_users_views()}
          value={view}
          onChoose={choose}
          views={VIEWS.map(value => ({ value, label: VIEW_LABEL[value](), count: counts[value] }))}
        />
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border bg-card px-4.5 py-6 text-center text-muted-foreground text-sm">
          {m.settings_users_empty()}
        </p>
      ) : (
        <UserAccountsTable rows={rows} />
      )}
      {canManage && <NewUserDialog open={creating} onOpenChange={setCreating} />}
    </div>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
