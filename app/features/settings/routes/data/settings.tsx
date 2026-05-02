import { ArrowRight } from 'lucide-react'
import { Link, redirect } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import type { Route } from './+types/settings'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_data_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const canManageSettings = permissions.has(Role.Admin)

  if (!canManageSettings) {
    throw redirect('/')
  }

  return null
}

export default function DataSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.settings_data_title()}
        subtitle={m.settings_data_subtitle()}
        breadcrumbs={[{ label: m.sidebar_settings(), to: '/settings' }, { label: m.sidebar_settings_data() }]}
      />

      <Card>
        <CardHeader>
          <CardTitle>{m.data_transfer_title()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between gap-5 rounded-lg border p-4">
            <span className="text-sm">{m.data_transfer_export_link()}</span>
            <Button variant="ghost" size="sm" asChild>
              <Link to="./export" className="flex items-center gap-2">
                {m.data_transfer_export_link()} <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="flex items-center justify-between gap-5 rounded-lg border p-4">
            <span className="text-sm">{m.data_transfer_import_link()}</span>
            <Button variant="ghost" size="sm" asChild>
              <Link to="./import" className="flex items-center gap-2">
                {m.data_transfer_import_link()} <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
