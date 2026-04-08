import { Pencil } from 'lucide-react'
import { Link } from 'react-router'

import { verifyPlatformAdmin } from '~/features/platform-admin/server/verify-platform-admin.server'
import { unscopedDb } from '~/shared/libs/db.server'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/congregations'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Congregations - Unitae Admin' }]
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
      <PageHeader title="Congregations" subtitle={`${congregations.length} congregation(s)`} />

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="text-center">Utilisateurs</TableHead>
                <TableHead className="text-center">Territoires</TableHead>
                <TableHead className="text-center">Statut</TableHead>
                <TableHead className="text-center">Creee le</TableHead>
                <TableHead />
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
                    <Badge variant={c.active ? 'default' : 'destructive'}>{c.active ? 'Active' : 'Inactive'}</Badge>
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString('fr')}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button variant="ghost" size="icon-xs" asChild>
                      <Link to={`/platform-admin/congregations/${c.id}/edit`}>
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
