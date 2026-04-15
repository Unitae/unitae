import { Pencil } from 'lucide-react'
import { Link } from 'react-router'
import { verifyPlatformAdmin } from '~/features/platform-admin/server/verify-platform-admin.server'
import * as m from '~/paraglide/messages'
import { unscopedDb } from '~/shared/libs/db.server'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'

import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/congregations'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.platform_admin_congregations_meta_title() }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifyPlatformAdmin(request)

  const congregations = await unscopedDb.congregation.findMany({
    include: {
      _count: {
        select: { users: true, territories: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return {
    congregations: congregations.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      domain: c.domain,
      active: c.active,
      userCount: c._count.users,
      territoryCount: c._count.territories,
      createdAt: c.createdAt,
    })),
  }
}

export default function CongregationsPage({ loaderData }: Route.ComponentProps) {
  const { congregations } = loaderData

  return (
    <div className="space-y-6">
      <PageHeader
        title={m.platform_admin_congregations_title()}
        subtitle={m.platform_admin_congregations_subtitle({ count: congregations.length })}
      />

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.platform_admin_congregations_col_name()}</TableHead>
              <TableHead>{m.platform_admin_congregations_col_slug()}</TableHead>
              <TableHead className="text-center">{m.platform_admin_congregations_col_users()}</TableHead>
              <TableHead className="text-center">{m.platform_admin_congregations_col_territories()}</TableHead>
              <TableHead className="text-center">{m.platform_admin_congregations_col_status()}</TableHead>
              <TableHead className="text-center">{m.platform_admin_congregations_col_created_at()}</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {congregations.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground">{c.slug}</TableCell>
                <TableCell className="text-center">{c.userCount}</TableCell>
                <TableCell className="text-center">{c.territoryCount}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={c.active ? 'default' : 'destructive'}>
                    {c.active
                      ? m.platform_admin_congregations_status_active()
                      : m.platform_admin_congregations_status_inactive()}
                  </Badge>
                </TableCell>
                <TableCell className="text-center text-muted-foreground">
                  {new Date(c.createdAt).toLocaleDateString('fr')}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" asChild>
                      <Link to={`/platform-admin/congregations/${c.id}/edit`}>
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
